<?php
/**
 * Plugin Name: Billiard Scoreboard (Live)
 * Description: Segnapunti biliardo con tastierini, "ultimo tiro", Memo, set ±, Nuova partita, Fine set (conferma), Azzera punteggi (conferma), offline local-first + sync, overlay OBS con loghi affiancati e centro fisso, fullscreen.
 * Version: 1.10.11
 * Author: Your Name
 * Requires at least: 5.8
 * Tested up to: 6.6
 * Requires PHP: 7.4
 * License: GPL2+
 */
if (!defined('ABSPATH')) { exit; }

class Billiard_Scoreboard_Plugin {
    const OPTION_PREFIX   = 'billiard_score_state_';
    const REST_NAMESPACE  = 'billiard/v1';
    const ASSET_HANDLE    = 'billiard-scoreboard-js';
    const CSS_HANDLE      = 'billiard-scoreboard-css';
    const JS_FILE         = 'assets/app.js';
    const CSS_FILE        = 'assets/billiard.css';

    public function __construct() {
        add_shortcode('billiard_scoreboard',    array($this, 'shortcode_scoreboard'));
        add_shortcode('billiard_overlay',       array($this, 'shortcode_overlay'));
        add_action('init',                      array($this, 'maybe_create_custom_css'));
        add_action('wp_enqueue_scripts',        array($this, 'register_assets'), 1000);
        add_action('rest_api_init',             array($this, 'register_routes'));
    }

    public function maybe_create_custom_css(){
        $up = wp_upload_dir(); if (!empty($up['error'])) return;
        $dir = trailingslashit($up['basedir']) . 'billiard-scoreboard';
        $file = trailingslashit($dir) . 'custom.css';
        if (!file_exists($dir)) { if (function_exists('wp_mkdir_p')) { @wp_mkdir_p($dir); } else { @mkdir($dir, 0755, true); } }
        if (is_dir($dir) && !file_exists($file)) { @file_put_contents($file, "/* Billiard Scoreboard override */
"); }
    }

    private function default_state($board_id) {
        return array(
            'board_id'      => $board_id,
            'player1_name'  => 'Giocatore 1',
            'player2_name'  => 'Giocatore 2',
            'score1'        => 0,
            'score2'        => 0,
            'sets1'         => 0,
            'sets2'         => 0,
            'log1'          => array(),
            'log2'          => array(),
            'last_updated'  => time(),
        );
    }
    private function option_key($board_id) { $safe = preg_replace('/[^a-zA-Z0-9_\-]/', '_', (string)$board_id); return self::OPTION_PREFIX . $safe; }
    private function get_state($board_id) {
        $state = get_option($this->option_key($board_id));
        if (!is_array($state)) { $state = $this->default_state($board_id); update_option($this->option_key($board_id), $state, false); }
        if (!isset($state['log1']) || !is_array($state['log1'])) $state['log1']=array();
        if (!isset($state['log2']) || !is_array($state['log2'])) $state['log2']=array();
        if (!isset($state['player1_name'])) $state['player1_name']='Giocatore 1';
        if (!isset($state['player2_name'])) $state['player2_name']='Giocatore 2';
        return $state;
    }
    private function save_state($board_id, $state) { $state['last_updated']=time(); update_option($this->option_key($board_id), $state, false); return $this->get_state($board_id); }

    public function register_routes() {
        register_rest_route(self::REST_NAMESPACE, '/state', array(
            array('methods'=>'GET','callback'=>function($req){ $board_id = $req->get_param('board_id') ? $req->get_param('board_id') : 'default'; return rest_ensure_response($this->get_state($board_id)); },'permission_callback'=>'__return_true'),
            array('methods'=>'POST','callback'=>function($req){
                $params=$req->get_json_params(); $board_id=isset($params['board_id'])?(string)$params['board_id']:'default'; $incoming=(isset($params['state'])&&is_array($params['state']))?$params['state']:array(); $current=$this->get_state($board_id);
                if(array_key_exists('score1',$incoming)) $current['score1']=intval($incoming['score1']);
                if(array_key_exists('score2',$incoming)) $current['score2']=intval($incoming['score2']);
                if(array_key_exists('sets1',$incoming))  $current['sets1']=max(0,intval($incoming['sets1']));
                if(array_key_exists('sets2',$incoming))  $current['sets2']=max(0,intval($incoming['sets2']));
                foreach(array('player1_name','player2_name') as $nk){ if(array_key_exists($nk,$incoming)) $current[$nk]=sanitize_text_field($incoming[$nk]); }
                if(isset($incoming['log_append']) && is_array($incoming['log_append'])){
                    $item=$incoming['log_append']; $player=isset($item['player'])?$item['player']:'';
                    $entry=array('delta'=>intval(isset($item['delta'])?$item['delta']:0),'after'=>intval(isset($item['after'])?$item['after']:0),'ts'=>time());
                    if($player==='p1'){ $current['log1'][]=$entry; if(count($current['log1'])>200) $current['log1']=array_slice($current['log1'],-200); }
                    elseif($player==='p2'){ $current['log2'][]=$entry; if(count($current['log2'])>200) $current['log2']=array_slice($current['log2'],-200); }
                }
                return rest_ensure_response($this->save_state($board_id,$current));
            },'permission_callback'=>'__return_true'),
        ));
        register_rest_route(self::REST_NAMESPACE, '/newmatch', array(
            'methods'=>'POST','callback'=>function($req){ $params=$req->get_json_params(); $board_id=(string)(isset($params['board_id'])?$params['board_id']:'default'); $state=$this->default_state($board_id); $new=$this->save_state($board_id,$state); return rest_ensure_response(array('ok'=>true,'state'=>$new)); },'permission_callback'=>'__return_true'
        ));
    }

    public function register_assets() {
        $js_url  = plugins_url(self::JS_FILE, __FILE__);
        $js_path = plugin_dir_path(__FILE__) . self::JS_FILE;
        $js_ver  = file_exists($js_path) ? filemtime($js_path) : '1.10.10';
        wp_enqueue_script(self::ASSET_HANDLE, $js_url, array(), $js_ver, true);
        wp_localize_script(self::ASSET_HANDLE, 'BsbSettings', array('root'=>esc_url_raw(rest_url())));

        $css_url = plugins_url(self::CSS_FILE, __FILE__);
        $css_path = plugin_dir_path(__FILE__) . self::CSS_FILE;
        $css_ver = file_exists($css_path) ? filemtime($css_path) : '1.10.10';
        wp_enqueue_style(self::CSS_HANDLE, $css_url, array(), $css_ver);

        $up = wp_upload_dir();
        $custom_url  = trailingslashit($up['baseurl'])  . 'billiard-scoreboard/custom.css';
        $custom_path = trailingslashit($up['basedir']) . 'billiard-scoreboard/custom.css';
        $custom_ver  = file_exists($custom_path) ? filemtime($custom_path) : (isset($_SERVER['REQUEST_TIME']) ? intval($_SERVER['REQUEST_TIME']) : time());
        wp_enqueue_style(self::CSS_HANDLE . '-custom', $custom_url, array(self::CSS_HANDLE), $custom_ver);
    }

    public function shortcode_scoreboard($atts) {
        $atts  = shortcode_atts(array(
            'id' => 'default',
            'brand_logo' => '',
            'dev_text'   => 'Sviluppato da',
            'dev_logo'   => '',
            'dev_link'   => '',
        ), $atts, 'billiard_scoreboard');

        $state = $this->get_state($atts['id']);

        $brand_logo = esc_url($atts['brand_logo']);
        $dev_text   = sanitize_text_field($atts['dev_text']);
        $dev_logo   = esc_url($atts['dev_logo']);
        $dev_link   = esc_url($atts['dev_link']);
        $show_brand = ($brand_logo || $dev_logo || $dev_text);

        ob_start(); ?>
        <div class="bsb-wrap">
          <div class="bsb-root" data-board-id="<?php echo esc_attr($state['board_id']); ?>" data-js="off">
            <div class="bsb-header bsb-header-3">
              <div class="bsb-name bsb-p1-name">
                <button class="bsb-editname bsb-editname-p1" type="button"><span class="bsb-p1-name-text"><?php echo esc_html($state['player1_name']); ?></span></button>
                <div class="row"><button class="bsb-setbtn bsb-setminus-p1" type="button">SET -</button><span class="bsb-sets bsb-sets-p1"><?php echo intval($state['sets1']); ?></span><button class="bsb-setbtn bsb-setplus-p1" type="button">SET +</button></div>
              </div>
              <div class="bsb-newholder">
                <div class="bsb-actions">
                  <button class="bsb-btn-fs" type="button" aria-pressed="false" title="Schermo intero">Schermo intero</button>
                  <button class="bsb-btn-reset-scores" type="button" title="Azzera tutto">Azzera tutto</button>
                  <span class="bsb-offline-flag" aria-hidden="true">Offline</span>
                </div>
                <div class="bsb-game-actions">
                  <button class="bsb-btn-newmatch" type="button">Nuova partita</button>
                  <button class="bsb-btn-endset" type="button">Fine set</button>
                </div>
              </div>
              <div class="bsb-name bsb-p2-name">
                <button class="bsb-editname bsb-editname-p2" type="button"><span class="bsb-p2-name-text"><?php echo esc_html($state['player2_name']); ?></span></button>
                <div class="row"><button class="bsb-setbtn bsb-setminus-p2" type="button">SET -</button><span class="bsb-sets bsb-sets-p2"><?php echo intval($state['sets2']); ?></span><button class="bsb-setbtn bsb-setplus-p2" type="button">SET +</button></div>
              </div>
            </div>

            <?php if ($show_brand): ?>
            <div class="bsb-brandbar bsb-brandbar--split">
              <div class="bsb-brand-left">
                <?php if ($brand_logo): ?>
                  <img class="bsb-brand-logo" src="<?php echo $brand_logo; ?>" alt="brand logo" />
                <?php endif; ?>
              </div>
              <div class="bsb-brand-right">
                <?php if ($dev_text): ?><div class="bsb-dev-text"><?php echo esc_html($dev_text); ?></div><?php endif; ?>
                <?php if ($dev_logo): ?>
                  <?php if ($dev_link): ?><a href="<?php echo $dev_link; ?>" target="_blank" rel="noopener"><?php endif; ?>
                    <img class="bsb-dev-logo" src="<?php echo $dev_logo; ?>" alt="developer logo" />
                  <?php if ($dev_link): ?></a><?php endif; ?>
                <?php endif; ?>
              </div>
            </div>
            <?php endif; ?>

            <div class="bsb-scores">
              <div class="bsb-score bsb-score-p1"><span class="bsb-prev bsb-prev-p1">ultimo tiro 0</span><button class="bsb-open-history-p1" type="button">Memo</button><span class="bsb-p1-score"><?php echo intval($state['score1']); ?></span></div>
              <div class="bsb-score bsb-score-p2"><span class="bsb-prev bsb-prev-p2">ultimo tiro 0</span><button class="bsb-open-history-p2" type="button">Memo</button><span class="bsb-p2-score"><?php echo intval($state['score2']); ?></span></div>
            </div>

            <div class="bsb-panels">
              <div><div class="bsb-keypad"><?php foreach(['1','2','3','4','5','6','7','8','9','-','0','C'] as $k): ?><button class="bsb-key" type="button" data-player="p1" data-key="<?php echo esc_attr($k); ?>"><?php echo esc_html($k); ?></button><?php endforeach; ?></div></div>
              <div><div class="bsb-keypad"><?php foreach(['1','2','3','4','5','6','7','8','9','-','0','C'] as $k): ?><button class="bsb-key" type="button" data-player="p2" data-key="<?php echo esc_attr($k); ?>"><?php echo esc_html($k); ?></button><?php endforeach; ?></div></div>
            </div>

            <!-- Memo modal -->
            <div class="bsb-hist-mask"></div>
            <div class="bsb-hist-modal">
              <div class="bsb-hist-head"><h3 class="bsb-hist-title">Memo</h3><button class="bsb-hist-close" type="button">Chiudi</button></div>
              <div class="bsb-hist-grid">
                <div class="bsb-hist side-p1"><h4 class="bsb-hist-title-p1"><?php echo esc_html($state['player1_name']); ?></h4><table><thead><tr><th></th><th>Variazione</th><th>Totale</th></tr></thead><tbody class="bsb-hist-p1"></tbody></table></div>
                <div class="bsb-hist side-p2"><h4 class="bsb-hist-title-p2"><?php echo esc_html($state['player2_name']); ?></h4><table><thead><tr><th></th><th>Variazione</th><th>Totale</th></tr></thead><tbody class="bsb-hist-p2"></tbody></table></div>
              </div>
            </div>

            <!-- Name modal -->
            <div class="bsb-name-mask"></div>
            <div class="bsb-name-modal">
              <div class="bsb-name-head"><h3 class="bsb-name-title">Modifica nome</h3></div>
              <div class="bsb-name-body">
                <input type="text" class="bsb-name-input" value="" />
              </div>
              <div class="bsb-name-actions">
                <button type="button" class="bsb-name-cancel">Annulla</button>
                <button type="button" class="bsb-name-save">Salva</button>
              </div>
            </div>

            <!-- Confirm modal -->
            <div class="bsb-cfm-mask"></div>
            <div class="bsb-cfm-modal">
              <div class="bsb-cfm-body"><p class="bsb-cfm-text">Confermi?</p><p class="bsb-cfm-subtext" style="display:none;"></p></div>
              <div class="bsb-cfm-actions">
                <button type="button" class="bsb-cfm-no">No</button>
                <button type="button" class="bsb-cfm-yes">Sì</button>
              </div>
            </div>

          </div>
        </div>
        <script>(window.BSB_BOOT && window.BSB_BOOT());</script>
        <?php return ob_get_clean();
    }

    public function shortcode_overlay($atts) {
        $atts = shortcode_atts(array(
            'id'=>'default',
            'height'=>'64',
            'width'=>'',            // lock width in px
            'bg'=>'transparent',
            'p1'=>'#0a7a5c',
            'p2'=>'#0a7a5c',
            'accent'=>'#f39c12',
            'text'=>'#ffffff',
            'logo'=> '',
            'logo1'=> '',
            'logo2'=> '',
            'sets'=>'1'
        ), $atts, 'billiard_overlay');
        $state=$this->get_state($atts['id']);
        $h=intval($atts['height']); if ($h<24) $h=24;
        $w = trim((string)$atts['width']); // may be empty
        $bg=esc_attr($atts['bg']); $p1c=esc_attr($atts['p1']); $p2c=esc_attr($atts['p2']); $ac=esc_attr($atts['accent']); $tx=esc_attr($atts['text']);
        $logo = esc_url($atts['logo']); $logo1=esc_url($atts['logo1']); $logo2=esc_url($atts['logo2']); $show_sets=$atts['sets']==='1';
        $style = "--ov-h:{$h}px; --ov-bg:{$bg}; --ov-tx:{$tx}; --ov-p1:{$p1c}; --ov-p2:{$p2c}; --ov-ac:{$ac};";
        if ($w !== '') {
            $w_px = intval($w);
            if ($w_px > 0) $style .= " width: {$w_px}px; max-width: {$w_px}px; margin: 0 auto;";
        }
        ob_start(); ?>
        <div class="bsb-overlay bsb-ovv2" data-board-id="<?php echo esc_attr($state['board_id']); ?>" style="<?php echo esc_attr($style); ?>">
          <div class="ov2-bar">
            <div class="ov2-side ov2-left">
              <div class="ov2-name ov2-left-name"><span class="ov2-name-text ov-p1-name"><?php echo esc_html($state['player1_name']); ?></span></div>
              <div class="ov2-score ov2-left-score ov-p1-score"><?php echo intval($state['score1']); ?></div>
              <?php if($show_sets): ?><div class="ov2-sets ov2-left-sets"><span class="ov2-setbox ov-p1-sets"><?php echo intval($state['sets1']); ?></span></div><?php endif; ?>
            </div>

            <div class="ov2-center">
              <div class="ov2-logos">
                <?php if($logo1 || $logo2): ?>
                  <?php if($logo1): ?><img class="ov2-logo" src="<?php echo $logo1; ?>" alt="logo1" /><?php endif; ?>
                  <?php if($logo2): ?><img class="ov2-logo" src="<?php echo $logo2; ?>" alt="logo2" /><?php endif; ?>
                <?php elseif($logo): ?>
                  <img class="ov2-logo" src="<?php echo $logo; ?>" alt="logo" />
                <?php else: ?>
                  <span class="ov2-dot">•</span>
                <?php endif; ?>
              </div>
            </div>

            <div class="ov2-side ov2-right">
              <?php if($show_sets): ?><div class="ov2-sets ov2-right-sets"><span class="ov2-setbox ov-p2-sets"><?php echo intval($state['sets2']); ?></span></div><?php endif; ?>
              <div class="ov2-score ov2-right-score ov-p2-score"><?php echo intval($state['score2']); ?></div>
              <div class="ov2-name ov2-right-name"><span class="ov2-name-text ov-p2-name"><?php echo esc_html($state['player2_name']); ?></span></div>
            </div>
          </div>
        </div>
        <?php return ob_get_clean();
    }
}
new Billiard_Scoreboard_Plugin();
