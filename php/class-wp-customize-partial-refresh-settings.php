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
			'settings' => $this->settings(),
		);

		// Export data to JS.
		wp_scripts()->add_data(
			$this->plugin->script_handles['settings'],
			'data',
			sprintf( 'var _customizePartialRefreshSettings = %s;', wp_json_encode( $exports ) )
		);
	}

	/**
	 * An array of all the partial refresh settings.
	 *
	 * @return array
	 */
	public function settings() {
		global $wp_customize;

		$settings = array();
		if ( $wp_customize ) {
			foreach ( $wp_customize->settings() as $setting ) {
				if ( empty( $setting->selector ) || 'partialRefresh' !== $setting->transport ) {
					continue;
				}
				if ( $setting->check_capabilities() ) {
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
		} else if ( ! isset( $_POST['setting_id'] ) ) {
			status_header( 400 );
			wp_send_json_error( 'missing_setting_id' );
		} else if ( ! isset( $_POST['customized'] ) ) {
			status_header( 400 );
			wp_send_json_error( 'missing_customized' );
		}

		global $wp_customize;
		$setting = $wp_customize->get_setting( $_POST['setting_id'] );

		if ( ! $setting ) {
			wp_send_json_error( 'setting_not_found' );
		} else if ( empty( $setting->selector ) ) {
			wp_send_json_error( 'setting_selector_not_found' );
		}

		/**
		 * Filter partial value for a successful AJAX request.
		 *
		 * @param mixed                $partial The partial value. Default null.
		 * @param WP_Customize_Setting $setting WP_Customize_Setting instance.
		 */
		$partial = apply_filters( 'customize_partial_refresh_settings', null, $setting );

		/**
		 * Filter partial value by setting ID for a successful AJAX request.
		 *
		 * @param mixed                $partial The partial value. Default null.
		 * @param WP_Customize_Setting $setting WP_Customize_Setting instance.
		 */
		$partial = apply_filters( "customize_partial_refresh_{$setting->id}", $partial, $setting );

		if ( null !== $partial ) {
			wp_send_json_success( $partial );
		} else {
			wp_send_json_error( 'missing_required_filter' );
		}
	}
}
