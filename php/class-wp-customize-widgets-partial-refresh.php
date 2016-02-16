<?php
/**
 * WP_Customize_Widgets_Partial_Refresh class.
 *
 * @package WordPress
 * @subpackage Customize
 * @since 4.5.0
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
	 * Filter args for dynamic widget partials.
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
		add_filter( 'wp_kses_allowed_html', array( $this, 'filter_wp_kses_allowed_data_attributes' ) );
		add_action( 'dynamic_sidebar_before', array( $this, 'start_dynamic_sidebar' ) );
		add_action( 'dynamic_sidebar_after', array( $this, 'end_dynamic_sidebar' ) );
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
		wp_enqueue_style( 'customize-partial-refresh-widgets-preview' );
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
		$sidebar_args = array_merge(
			array(
				'before_widget' => '',
				'after_widget' => '',
			),
			$params[0]
		);

		// Skip widgets not in a registered sidebar or ones which lack a proper wrapper element to attach the data-* attributes to.
		$matches = array();
		$is_valid = (
			isset( $sidebar_args['id'] )
			&&
			is_registered_sidebar( $sidebar_args['id'] )
			&&
			( isset( $this->current_dynamic_sidebar_id_stack[0] ) && $this->current_dynamic_sidebar_id_stack[0] === $sidebar_args['id'] )
			&&
			preg_match( '#^<(?P<tag_name>\w+)#', $sidebar_args['before_widget'], $matches )
		);
		if ( ! $is_valid ) {
			return $params;
		}
		$this->before_widget_tags_seen[ $matches['tag_name'] ] = true;

		$context = array(
			'sidebar_id' => $sidebar_args['id'],
		);
		if ( isset( $this->context_sidebar_instance_number ) ) {
			$context['sidebar_instance_number'] = $this->context_sidebar_instance_number;
		} else if ( isset( $sidebar_args['id'] ) && isset( $this->sidebar_instance_count[ $sidebar_args['id'] ] ) ) {
			$context['sidebar_instance_number'] = $this->sidebar_instance_count[ $sidebar_args['id'] ];
		}

		$attributes = sprintf( ' data-customize-partial-id="%s"', esc_attr( 'widget[' . $sidebar_args['widget_id'] . ']' ) );
		$attributes .= ' data-customize-partial-type="widget"';
		$attributes .= sprintf( ' data-customize-partial-placement-context="%s"', esc_attr( wp_json_encode( $context ) ) );
		$attributes .= sprintf( ' data-customize-widget-id="%s"', esc_attr( $sidebar_args['widget_id'] ) );
		$sidebar_args['before_widget'] = preg_replace( '#^(<\w+)#', '$1 ' . $attributes, $sidebar_args['before_widget'] );

		$params[0] = $sidebar_args;
		return $params;
	}

	/**
	 * List of the tag names seen for before_widget strings.
	 *
	 * This is used in the filter_wp_kses_allowed_html filter to ensure that the
	 * data-* attributes can be whitelisted.
	 *
	 * @since 4.5.0
	 * @access private
	 * @var array
	 */
	protected $before_widget_tags_seen = array();

	/**
	 * Ensure that the HTML data-* attributes for selective refresh are allowed by kses.
	 *
	 * This is needed in case the $before_widget is run through wp_kses() when printed.
	 *
	 * @since 4.5.0
	 * @access private
	 *
	 * @param array $allowed_html Allowed HTML.
	 * @return array Allowed HTML.
	 */
	function filter_wp_kses_allowed_data_attributes( $allowed_html ) {
		foreach ( array_keys( $this->before_widget_tags_seen ) as $tag_name ) {
			if ( ! isset( $allowed_html[ $tag_name ] ) ) {
				$allowed_html[ $tag_name ] = array();
			}
			$allowed_html[ $tag_name ] = array_merge(
				$allowed_html[ $tag_name ],
				array_fill_keys( array(
					'data-customize-partial-id',
					'data-customize-partial-type',
					'data-customize-partial-placement-context',
					'data-customize-partial-widget-id',
					'data-customize-partial-options',
				), true )
			);
		}
		return $allowed_html;
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
	 * The current request's sidebar_instance_number context.
	 *
	 * @since 4.5.0
	 * @access private
	 * @var int
	 */
	protected $context_sidebar_instance_number;

	/**
	 * Current sidebar ID being rendered.
	 *
	 * @since 4.5.0
	 * @access private
	 * @var array
	 */
	protected $current_dynamic_sidebar_id_stack = array();

	/**
	 * Start keeping track of the current sidebar being rendered.
	 *
	 * Insert marker before widgets are rendered in a dynamic sidebar.
	 *
	 * @since 4.5.0
	 *
	 * @param int|string $index Index, name, or ID of the dynamic sidebar.
	 */
	public function start_dynamic_sidebar( $index ) {
		array_unshift( $this->current_dynamic_sidebar_id_stack, $index );
		if ( ! isset( $this->sidebar_instance_count[ $index ] ) ) {
			$this->sidebar_instance_count[ $index ] = 0;
		}
		$this->sidebar_instance_count[ $index ] += 1;
		if ( ! $this->manager->selective_refresh->is_render_partials_request() ) {
			printf( "\n<!--dynamic_sidebar_before:%s:%d-->\n", esc_html( $index ), intval( $this->sidebar_instance_count[ $index ] ) );
		}
	}

	/**
	 * Finish keeping track of the current sidebar being rendered.
	 *
	 * Insert marker after widgets are rendered in a dynamic sidebar.
	 *
	 * @since 4.5.0
	 *
	 * @param int|string $index Index, name, or ID of the dynamic sidebar.
	 */
	public function end_dynamic_sidebar( $index ) {
		assert( array_shift( $this->current_dynamic_sidebar_id_stack ) === $index );
		if ( ! $this->manager->selective_refresh->is_render_partials_request() ) {
			printf( "\n<!--dynamic_sidebar_after:%s:%d-->\n", esc_html( $index ), intval( $this->sidebar_instance_count[ $index ] ) );
		}
	}

	/**
	 * Current sidebar being rendered.
	 *
	 * @since 4.5.0
	 * @access private
	 * @var string
	 */
	protected $rendering_widget_id;

	/**
	 * Current widget being rendered.
	 *
	 * @since 4.5.0
	 * @access private
	 * @var string
	 */
	protected $rendering_sidebar_id;

	/**
	 * Filter sidebars_widgets to ensure the currently-rendered widget is the only widget in the current sidebar.
	 *
	 * @since 4.5.0
	 * @access private
	 *
	 * @param array $sidebars_widgets Sidebars widgets.
	 * @return array Sidebars widgets.
	 */
	public function filter_sidebars_widgets_for_rendering_widget( $sidebars_widgets ) {
		$sidebars_widgets[ $this->rendering_sidebar_id ] = array( $this->rendering_widget_id );
		return $sidebars_widgets;
	}

	/**
	 * Render a specific widget using the supplied sidebar arguments.
	 *
	 * @since 4.5.0
	 * @access public
	 *
	 * @see dynamic_sidebar()
	 *
	 * @param WP_Customize_Partial $partial      Partial.
	 * @param array                $context {
	 *     Sidebar args supplied as container context.
	 *
	 *     @type string $sidebar_id                ID for sidebar for widget to render into.
	 *     @type int    [$sidebar_instance_number] Disambiguating instance number.
	 * }
	 * @return string|false
	 */
	public function render_widget_partial( $partial, $context ) {
		$id_data = $partial->id_data();
		$widget_id = array_shift( $id_data['keys'] );
		if ( ! is_array( $context ) || empty( $context['sidebar_id'] ) || ! is_registered_sidebar( $context['sidebar_id'] ) ) {
			return false;
		}
		$this->rendering_sidebar_id = $context['sidebar_id'];

		if ( isset( $context['sidebar_instance_number'] ) ) {
			$this->context_sidebar_instance_number = intval( $context['sidebar_instance_number'] );
		}

		// Filter sidebars_widgets so that only the queried widget is in the sidebar.
		$this->rendering_widget_id = $widget_id;

		$filter_callback = array( $this, 'filter_sidebars_widgets_for_rendering_widget' );
		add_filter( 'sidebars_widgets', $filter_callback, 1000 );

		// Render the widget.
		ob_start();
		dynamic_sidebar( $this->rendering_sidebar_id = $context['sidebar_id'] );
		$container = ob_get_clean();

		// Reset variables for next partial render.
		remove_filter( 'sidebars_widgets', $filter_callback, 1000 );
		$this->context_sidebar_instance_number = null;
		$this->rendering_sidebar_id = null;
		$this->rendering_widget_id = null;

		return $container;
	}
}
