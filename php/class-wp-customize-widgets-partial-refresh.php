<?php
/**
 * WP_Customize_Widgets_Partial_Refresh class.
 *
 * @package WordPress
 */

/**
 * The methods and properties of this class will be integrated into WP_Customize_Widgets.
 */
class WP_Customize_Widgets_Partial_Refresh {

	/**
	 * Plugin instance.
	 *
	 * This will not be included in core merge.
	 *
	 * @access public
	 * @var WP_Customize_Manager
	 */
	public $manager;

	/**
	 * WP_Customize_Nav_Menu_Selective_Refresh constructor.
	 *
	 * This will not be included in #coremerge.
	 *
	 * @param WP_Customize_Manager $manager Manager.
	 */
	function __construct( WP_Customize_Manager $manager ) {
		$this->manager = $manager;

		if ( ! isset( $manager->selective_refresh ) ) {
			return;
		}
		add_filter( 'widget_customizer_setting_args', array( $this, 'filter_widget_customizer_setting_args' ), 10, 2 );
		add_filter( 'customize_dynamic_partial_args', array( $this, 'customize_dynamic_partial_args' ), 10, 2 );
		add_action( 'customize_preview_init', array( $this, 'customize_preview_init' ) );
	}

	/**
	 * Let sidebars_widgets and widget instance settings all have postMessage transport.
	 *
	 * The preview will determine whether or not the setting change requires a full refresh.
	 *
	 * @param array $args Setting args.
	 * @return array
	 */
	public function filter_widget_customizer_setting_args( $args ) {
		$args['transport'] = 'postMessage';
		return $args;
	}

	/**
	 * Filter args for nav_menu partials.
	 *
	 * @since 4.5.0
	 *
	 * @param array|false $partial_args Partial args.
	 * @param string      $partial_id  Partial ID.
	 * @return array Partial args
	 */
	public function customize_dynamic_partial_args( $partial_args, $partial_id ) {

		if ( preg_match( '/^widget\[.+\]$/', $partial_id ) ) {
			if ( false === $partial_args ) {
				$partial_args = array();
			}
			$partial_args = array_merge(
				$partial_args,
				array(
					'type' => 'widget',
					'render_callback' => array( $this, 'render_widget_partial' ),
				)
			);
		}

		return $partial_args;
	}

	/**
	 * Add hooks for the Customizer preview.
	 *
	 * @since 4.5.0
	 * @access public
	 */
	public function customize_preview_init() {
		add_action( 'wp_enqueue_scripts', array( $this, 'customize_preview_enqueue_deps' ) );
		add_filter( 'dynamic_sidebar_params', array( $this, 'filter_dynamic_sidebar_params' ) );
	}

	/**
	 * Enqueue scripts for the Customizer preview.
	 *
	 * @since 4.5.0
	 * @access public
	 */
	public function customize_preview_enqueue_deps() {
		wp_enqueue_script( 'customize-preview-widgets' ); // Note that we have overridden this.
		wp_enqueue_style( 'customize-preview' );
	}

	/**
	 * Keep track of the arguments that are being passed to the_widget().
	 *
	 * @param array $params {
	 *     Dynamic sidebar params.
	 *
	 *     @type array $args        Sidebar args.
	 *     @type array $widget_args Widget args.
	 * }
	 * @see WP_Customize_Nav_Menus_Partial_Refresh::filter_wp_nav_menu_args()
	 *
	 * @return array Params.
	 */
	public function filter_dynamic_sidebar_params( $params ) {

		// Skip widgets that lack a proper wrapper element.
		if ( '<' !== substr( $params[0]['before_widget'], 0, 1 ) || '</' !== substr( $params[0]['after_widget'], 0, 2 ) ) {
			return $params;
		}

		$exported_params = $params;
		$exported_params['params_hmac'] = $this->hash_sidebar_params( $this->sort_sidebar_params( $exported_params ) );

		// @todo We don't even need to export the root element because we're not including it in the output anyway.
		$params[0]['before_widget'] = preg_replace(
			'#^(<\w+)#',
			str_replace( '%', '%%', sprintf( '$1 data-customize-dynamic-sidebar-params="%s"', esc_attr( wp_json_encode( $exported_params ) ) ) ),
			$params[0]['before_widget']
		);

		return $params;
	}

	/**
	 * Sort params to safely hash the serialized value.
	 *
	 * @since 4.5.0
	 * @access protected
	 *
	 * @param array $params Params.
	 * @return array Sorted params.
	 */
	protected function sort_sidebar_params( $params ) {
		foreach ( $params as $i => &$args ) {
			ksort( $args );
		}
		return $params;
	}

	/**
	 * Hash (hmac) the arguments with the nonce and secret auth key to ensure they
	 * are not tampered with when submitted in the Ajax request.
	 *
	 * @since 4.5.0
	 * @access public
	 *
	 * @param array $params The sidebar params to hash. Note that this multidimensional array is positional at the root.
	 * @return string
	 */
	public function hash_sidebar_params( $params ) {
		foreach ( $params as $i => &$args ) {
			ksort( $args );
		}
		return wp_hash( serialize( $params ) );
	}

	/**
	 * Render a specific widget using the supplied sidebar arguments.
	 *
	 * @since 4.5.0
	 * @access public
	 *
	 * @see the_widget()
	 * @see dynamic_sidebar()
	 *
	 * @param WP_Customize_Partial $partial      Partial.
	 * @param array                $sidebar_args Sidebar args supplied as container context.
	 * @return string|false
	 */
	public function render_widget_partial( $partial, $sidebar_args ) {
		unset( $partial, $sidebar_args );

		// @todo All of it.
		return false;
	}
}
