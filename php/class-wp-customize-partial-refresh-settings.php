<?php
/**
 * Implements partial refresh for selective settings.
 */
class WP_Customize_Partial_Refresh_Settings {

	/**
	 * Alias for the AJAX action.
	 *
	 * @type string
	 */
	const AJAX_ACTION = 'customize_partial_refresh_settings';

	/**
	 * WP_Customize_Partial_Refresh_Plugin instance.
	 *
	 * @var WP_Customize_Partial_Refresh_Plugin
	 */
	public $plugin;

	/**
	 * Customize manager.
	 *
	 * @var WP_Customize_Manager
	 */
	public $customize_manager;

	/**
	 * Constructor.
	 *
	 * @param WP_Customize_Partial_Refresh_Plugin $plugin Plugin instance.
	 */
	public function __construct( WP_Customize_Partial_Refresh_Plugin $plugin ) {
		$this->plugin = $plugin;
		add_action( 'after_setup_theme', array( $this, 'init' ), 11 );
	}

	/**
	 * Initialize selective partial refresh.
	 *
	 * @action after_setup_theme
	 */
	public function init() {
		add_action( 'wp_ajax_' . self::AJAX_ACTION, array( $this, 'refresh' ) );
		add_action( 'customize_controls_print_footer_scripts', array( $this, 'enqueue_scripts' ) );
		global $wp_customize;
		if ( isset( $wp_customize ) ) {
			$this->customize_manager = $wp_customize;
		}
	}

	/**
	 * Enqueue scripts.
	 *
	 * @action customize_controls_enqueue_scripts
	 */
	function enqueue_scripts() {
		wp_enqueue_script( $this->plugin->script_handles['settings'] );

		// Script data array.
		$exports = array(
			'nonce' => wp_create_nonce( self::AJAX_ACTION ),
			'action' => self::AJAX_ACTION,
			'settingSelectors' => $this->get_setting_selectors(),
		);

		// Export data to JS.
		wp_scripts()->add_data(
			$this->plugin->script_handles['settings'],
			'data',
			sprintf( 'var _customizePartialRefreshSettings = %s;', wp_json_encode( $exports ) )
		);
	}

	/**
	 * An array of all the selectors for settings.
	 *
	 * @todo This will be exported as part of WP_Customize_Setting::json() in the core merge.
	 *
	 * @return array
	 */
	public function get_setting_selectors() {
		$settings = array();
		if ( $this->customize_manager ) {
			foreach ( $this->customize_manager->settings() as $setting ) {
				if ( ! empty( $setting->selector ) && $setting->check_capabilities() ) {
					$settings[ $setting->id ] = $setting->selector;
				}
			}
		}
		return $settings;
	}

	/**
	 * Ajax request to return the settings partial value.
	 *
	 * @action wp_ajax_customize_partial_refresh_settings
	 */
	public function refresh() {
		if ( ! check_ajax_referer( self::AJAX_ACTION, 'nonce', false ) ) {
			status_header( 400 );
			wp_send_json_error( 'bad_nonce' );
		} else if ( ! current_user_can( 'customize' ) || ! is_customize_preview() ) {
			status_header( 403 );
			wp_send_json_error( 'customize_not_allowed' );
		} else if ( ! isset( $_POST['setting_ids'] ) ) {
			status_header( 400 );
			wp_send_json_error( 'missing_setting_ids' );
		} else if ( ! is_array( $_POST['setting_ids'] ) ) {
			status_header( 400 );
			wp_send_json_error( 'bad_setting_ids' );
		}

		$results = array();

		$setting_ids = wp_unslash( $_POST['setting_ids'] );
		foreach ( $setting_ids as $setting_id ) {
			$setting = $this->customize_manager->get_setting( $setting_id );
			if ( ! $setting ) {
				$results[ $setting_id ] = array( 'error' => 'unrecognized_setting' );
				continue;
			}

			$setting->preview();

			$rendered = null;
			if ( method_exists( $setting, 'render' ) ) {
				// @todo This will not be needed after the core merge, because the setting will take this as part of the construcor?
				// @todo There should be a WP_Customize_Setting::render() which by default is added as the filter.
				// @todo Note that the default implementation of
				// Note render in the context of the REST API. The value() corresponds to raw in the API.
				$rendered = $setting->render(); // @todo Or render partial?
			} else {
				/*
				 * The default WP_Customize_Setting::render() method would just
				 * be an alias for WP_Customize_Setting::value(), which would
				 * include PHP sanitization. An implementation of a setting would
				 * then define a render() method to add any filters needed to
				 * render the raw value for display.
				 *
				 * @todo What about a setting that appears in multiple contexts?? It could have different renderings applied. Should a setting have multiple selectors?
				 * @todo This should be abstracted away from partials altogether. A partial is what displays a rendered value.
				 * @todo Each postMessage value should get sent for sanitization and update in the setting regardless. This can be done as part of transactions when they are pushed.
				 * @todo There should be a new WP_Customize_Partial which has a selector and can be tied to any number of settings.
				 */
				$rendered = $setting->value();
			}

			/**
			 * Filter partial value for a successful AJAX request.
			 *
			 * @param mixed                $rendered The partial value. Default null.
			 * @param WP_Customize_Setting $setting WP_Customize_Setting instance.
			 */
			$rendered = apply_filters( 'customize_setting_render', $rendered, $setting );

			/**
			 * Filter partial value by setting ID for a successful AJAX request.
			 *
			 * @param mixed                $rendered The partial value. Default null.
			 * @param WP_Customize_Setting $setting WP_Customize_Setting instance.
			 */
			$rendered = apply_filters( "customize_setting_render_{$setting->id}", $rendered, $setting );

			$results[ $setting_id ] = array(
				'data' => $rendered,
			);
		}

		wp_send_json_success( $results );
	}
}
