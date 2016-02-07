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
		add_action( 'customize_controls_enqueue_scripts', array( $this, 'customize_pane_enqueue_scripts' ) );
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

		if ( preg_match( '/^widget_instance\[.+\]$/', $partial_id ) ) {
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
		if ( ! $this->manager->selective_refresh->is_render_partials_request() ) {
			add_action( 'dynamic_sidebar_before', array( $this, 'insert_before_sidebar_marker' ) );
			add_action( 'dynamic_sidebar_after', array( $this, 'insert_after_sidebar_marker' ) );
		}
	}

	/**
	 * Enqueue scripts for the Customizer pane.
	 *
	 * @since 4.5.0
	 * @access public
	 */
	public function customize_pane_enqueue_scripts() {
		wp_enqueue_script( 'customize-widgets-hacks' );
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

		$context = array(
			'sidebar_id' => $params[0]['id'],
			'sidebar_instance_number' => null,
		);
		if ( isset( $this->sidebar_instance_count[ $params[0]['id'] ] ) ) {
			$context['sidebar_instance_number'] = $this->sidebar_instance_count[ $params[0]['id'] ];
		}

		// @todo We don't even need to export the root element because we're not including it in the output anyway.
		$params[0]['before_widget'] = preg_replace(
			'#^(<\w+)#',
			sprintf(
				'$1 data-customize-widget-id="%s" data-customize-container-context="%s"',
				esc_attr( $params[0]['widget_id'] ), // In case the widget decides to remove the ID attribute.
				esc_attr( wp_json_encode( $context ) )
			),
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
	 * Keep track of the number of times that dynamic_sidebar() was called for a given sidebar index.
	 *
	 * This helps facilitate the uncommon scenario where a single sidebar is rendered multiple times on a template.
	 *
	 * @since 4.5.0
	 * @access private
	 * @var array
	 */
	protected $sidebar_instance_count = array();

	/**
	 * Insert marker before widgets are rendered in a dynamic sidebar.
	 *
	 * @since 4.5.0
	 *
	 * @param int|string $index Index, name, or ID of the dynamic sidebar.
	 */
	public function insert_before_sidebar_marker( $index ) {
		if ( ! isset( $this->sidebar_instance_count[ $index ] ) ) {
			$this->sidebar_instance_count[ $index ] = 0;
		}
		$this->sidebar_instance_count[ $index ] += 1;
		printf( "\n<!--dynamic_sidebar_before:%s:%d-->\n", esc_html( $index ), intval( $this->sidebar_instance_count[ $index ] ) );
	}

	/**
	 * Insert marker after widgets are rendered in a dynamic sidebar.
	 *
	 * @since 4.5.0
	 *
	 * @param int|string $index Index, name, or ID of the dynamic sidebar.
	 */
	public function insert_after_sidebar_marker( $index ) {
		printf( "\n<!--dynamic_sidebar_after:%s:%d-->\n", esc_html( $index ), intval( $this->sidebar_instance_count[ $index ] ) );
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
	 * @param array                $context {
	 *     Sidebar args supplied as container context.
	 *
	 *     @type string $sidebar_id  Sidebar args supplied as container context.
	 * }
	 * @return string|false
	 */
	public function render_widget_partial( $partial, $context ) {
		if ( empty( $context['sidebar_id'] ) || ! is_registered_sidebar( $context['sidebar_id'] ) ) {
			return false;
		}

		$id_data = $partial->id_data();
		$widget_id = array_shift( $id_data['keys'] );
		if ( empty( $widget_id ) ) {
			return false;
		}

		$filter = function( $sidebars_widgets ) use ( $context, $widget_id ) {
			$sidebars_widgets[ $context['sidebar_id'] ] = array( $widget_id );
			return $sidebars_widgets;
		};

		// Filter sidebars_widgets so that only the queried widget is in the sidebar.
		add_filter( 'sidebars_widgets', $filter, 1000 );

		ob_start();
		dynamic_sidebar( $context['sidebar_id'] );
		$container = ob_get_clean();

		remove_filter( 'sidebars_widgets', $filter, 1000 );

		return $container;
	}
}
