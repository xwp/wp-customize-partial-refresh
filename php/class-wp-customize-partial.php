<?php
/**
 * Representation of a rendered region in the previewed page that gets
 * selectively refreshed when an associated setting is changed.
 *
 * This class is analagous of WP_Customize_Control.
 *
 * @todo Just call this a WP_Customize_Template_Part?
 */
class WP_Customize_Partial {

	/**
	 * Customize manager.
	 *
	 * @since 4.5.0
	 * @access public
	 * @var WP_Customize_Manager
	 */
	public $manager;

	/**
	 * Plugin instance.
	 *
	 * @todo Note that this will be obsolete once features are added to WP_Customize_Manager in the core merge.
	 *
	 * @since 4.5.0
	 * @access public
	 * @var WP_Customize_Partial_Refresh_Plugin
	 */
	public $plugin;

	/**
	 * Unique identifier for the partial.
	 *
	 * If the partial is used to display a single setting, this would generally
	 * be the same as the associated setting's ID.
	 *
	 * @since 4.5.0
	 * @access public
	 * @var string
	 */
	public $id;

	/**
	 * Type of this partial.
	 *
	 * @since 4.5.0
	 * @access public
	 * @var string
	 */
	public $type = 'default';

	/**
	 * The jQuery selector to find the container element for the partial.
	 *
	 * @since 4.5.0
	 * @access public
	 * @var string
	 */
	public $selector;

	/**
	 * All settings tied to the partial.
	 *
	 * @access public
	 * @since 4.5.0
	 * @var WP_Customize_Setting[]
	 */
	public $settings;

	/**
	 * The ID for the setting that this partial is primarily responsible for rendering.
	 *
	 * If not supplied, it will default to the ID of the first setting.
	 *
	 * @since 4.5.0
	 * @access public
	 * @var string
	 */
	public $primary_setting;

	/**
	 * Render callback.
	 *
	 * @since 4.5.0
	 * @access public
	 * @see WP_Customize_Partial::render()
	 * @var callable Callback is called with one argument, the instance of
	 *                 WP_Customize_Partial. The callback can either echo the
	 *                 partial or return the partial as a string, or return false if error.
	 */
	public $render_callback;

	/**
	 * Whether to refresh the entire preview in case a partial cannot be refreshed.
	 *
	 * A partial render is considered a failure if the render_callback returns false.
	 *
	 * @since 4.5.0
	 * @access public
	 * @var bool
	 */
	public $fallback_refresh = true;

	/**
	 * Whether the partial render includes the container element, and whether to replace it along with the contents.
	 *
	 * @todo Allow this to be 'auto' by default, which means that if the rendered response has a root element and it has the same type, ID, and classNames as container, then just update contents?
	 * @todo public $container_inclusive = false; ?
	 *
	 * @var bool
	 */

	/**
	 * Constructor.
	 *
	 * Supplied `$args` override class property defaults.
	 *
	 * If `$args['settings']` is not defined, use the $id as the setting ID.
	 *
	 * @param WP_Customize_Partial_Refresh_Plugin $plugin Customize Partial Refresh plugin instance. @todo This will be $manager in the core merge.
	 * @param string                              $id      Control ID.
	 * @param array                               $args    {
	 *     Optional. Arguments to override class property defaults.
	 *
	 *     @type array|string  $settings        All settings IDs tied to the partial. If undefined, `$id` will be used.
	 * }
	 */
	public function __construct( $plugin, $id, $args = array() ) {
		$keys = array_keys( get_object_vars( $this ) );
		foreach ( $keys as $key ) {
			if ( isset( $args[ $key ] ) ) {
				$this->$key = $args[ $key ];
			}
		}

		$this->plugin = $plugin; // @todo This will be $manager in the Core merge.
		$this->manager = $plugin->selective_refresh->manager;
		$this->id = $id;
		if ( empty( $this->render_callback ) ) {
			$this->render_callback = array( $this, 'render_callback' );
		}

		// Process settings.
		if ( empty( $this->settings ) ) {
			$this->settings = array( $id );
		} else if ( ! is_array( $this->settings ) ) {
			$this->settings = array( $this->settings );
		}
		if ( empty( $this->primary_setting ) ) {
			$this->primary_setting = current( $this->settings );
		}
	}

	/**
	 * Render the template partial involving the associated settings.
	 *
	 * @since 4.5.0
	 * @access public
	 *
	 * @param array $container_context Optional array of context data associated with the target container.
	 * @todo How many mechanisms do we want to provide? render_callback, and filters, and overridable method?
	 *
	 * @return string|false The rendered partial as a string, or false if no render applied.
	 */
	final public function render( $container_context = array() ) {
		$partial = $this;

		$rendered = false;
		if ( ! empty( $this->render_callback ) ) {
			ob_start();
			$return_render = call_user_func( $this->render_callback, $this, $container_context );
			$ob_render = ob_get_clean();

			if ( null !== $return_render && '' !== $ob_render ) {
				_doing_it_wrong( __FUNCTION__, __( 'Partial render must echo the content or return the content string, but not both.' ), '4.5.0' );
			}

			// Note that the string return takes precedence because the $ob_render may just include PHP warnings or notices.
			if ( null !== $return_render ) {
				$rendered = $return_render;
			} else {
				$rendered = $ob_render;
			}
		}

		/**
		 * Filter partial rendering.
		 *
		 * @param string|false         $rendered          The partial value. Default false.
		 * @param WP_Customize_Partial $partial           WP_Customize_Setting instance.
		 * @param array                $container_context Optional array of context data associated with the target container.
		 */
		$rendered = apply_filters( 'customize_setting_render', $rendered, $partial, $container_context );

		/**
		 * Filter partial rendering by the partial ID.
		 *
		 * @param string|false         $rendered          The partial value. Default false.
		 * @param WP_Customize_Partial $partial           WP_Customize_Setting instance.
		 * @param array                $container_context Optional array of context data associated with the target container.
		 */
		$rendered = apply_filters( "customize_setting_render_{$partial->id}", $rendered, $partial, $container_context );

		return $rendered;
	}

	/**
	 * Default callback used when invoking WP_Customize_Control::render().
	 *
	 * Note that this method may echo the partial *or* return the partial as
	 * a string, but not both. Output buffering is performed when this is called.
	 *
	 * Subclasses can override this with their specific logic, or they may
	 * provide an 'render_callback' argument to the constructor.
	 *
	 * @access public
	 *
	 * @return string|false
	 */
	public function render_callback() {
		return false;
	}

	/**
	 * Get the data to export to the client via JSON.
	 *
	 * @return array Array of parameters passed to the JavaScript.
	 */
	public function json() {
		$exports = array();
		$exports['settings'] = $this->settings;
		$exports['primarySetting'] = $this->primary_setting;
		$exports['selector'] = $this->selector;
		$exports['type'] = $this->type;
		$exports['fallbackRefresh'] = $this->fallback_refresh;
		return $exports;
	}
}
