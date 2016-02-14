<?php
/**
 * WP_Customize_Selective_Refresh tests.
 *
 * @package WordPress
 */

/**
 * Tests for the WP_Customize_Selective_Refresh class.
 *
 * @group customize
 */
class Test_WP_Customize_Selective_Refresh extends WP_UnitTestCase {

	/**
	 * Manager.
	 *
	 * @var WP_Customize_Manager
	 */
	public $wp_customize;

	/**
	 * Component.
	 *
	 * @var WP_Customize_Selective_Refresh
	 */
	public $selective_refresh;

	/**
	 * Set up the test fixture.
	 */
	function setUp() {
		parent::setUp();
		require_once( ABSPATH . WPINC . '/class-wp-customize-manager.php' );
		// @codingStandardsIgnoreStart
		$GLOBALS['wp_customize'] = new WP_Customize_Manager();
		// @codingStandardsIgnoreEnd
		$this->wp_customize = $GLOBALS['wp_customize'];
		if ( isset( $this->wp_customize->selective_refresh ) ) {
			$this->selective_refresh = $this->wp_customize->selective_refresh;
		}
	}

	/**
	 * Test customize_partial_refresh_filter_customize_loaded_components().
	 *
	 * @see customize_partial_refresh_filter_customize_loaded_components()
	 */
	function test_bootstrap() {
		$this->assertTrue( ! empty( $this->wp_customize->selective_refresh ) );
		$this->assertInstanceOf( 'WP_Customize_Selective_Refresh', $this->wp_customize->selective_refresh );
		$this->assertTrue( ! empty( $this->wp_customize->selective_refresh->widgets ) );
		$this->assertInstanceOf( 'WP_Customize_Widgets_Partial_Refresh', $this->wp_customize->selective_refresh->widgets );
		$this->assertTrue( ! empty( $this->wp_customize->selective_refresh->nav_menus ) );
		$this->assertInstanceOf( 'WP_Customize_Nav_Menus_Partial_Refresh', $this->wp_customize->selective_refresh->nav_menus );
	}

	/**
	 * Test WP_Customize_Selective_Refresh::__construct().
	 *
	 * @see WP_Customize_Selective_Refresh::__construct()
	 */
	function test_construct() {
		$this->assertEquals( $this->wp_customize, $this->wp_customize->selective_refresh->manager );
		$this->assertInstanceOf( 'WP_Customize_Manager', $this->wp_customize->selective_refresh->manager );
	}

	/**
	 * Test WP_Customize_Selective_Refresh::register_scripts().
	 *
	 * @see WP_Customize_Selective_Refresh::register_scripts()
	 */
	function test_register_scripts() {
		$scripts = new WP_Scripts();
		$handles = array(
			'customize-controls-hacks',
			'customize-widgets-hacks',
			'customize-selective-refresh',
			'customize-preview-nav-menus',
			'customize-preview-widgets',
		);
		foreach ( $handles as $handle ) {
			$this->assertArrayHasKey( $handle, $scripts->registered );
		}
	}

	/**
	 * Test WP_Customize_Selective_Refresh::register_styles().
	 *
	 * @see WP_Customize_Selective_Refresh::register_styles()
	 */
	function test_register_styles() {
		$styles = new WP_Styles();
		$handles = array(
			'customize-partial-refresh-widgets-preview',
		);
		foreach ( $handles as $handle ) {
			$this->assertArrayHasKey( $handle, $styles->registered );
		}
	}

	/**
	 * Test WP_Customize_Selective_Refresh::partials().
	 *
	 * @see WP_Customize_Selective_Refresh::partials()
	 */
	function test_partials() {
		$this->assertInternalType( 'array', $this->selective_refresh->partials() );
	}

	/**
	 * Test CRUD methods for partials.
	 *
	 * @see WP_Customize_Selective_Refresh::get_partial()
	 * @see WP_Customize_Selective_Refresh::add_partial()
	 * @see WP_Customize_Selective_Refresh::remove_partial()
	 */
	function test_crud_partial() {
		$partial = $this->selective_refresh->add_partial( 'foo' );
		$this->assertInstanceOf( 'WP_Customize_Partial', $partial );
		$this->assertEquals( $partial, $this->selective_refresh->get_partial( $partial->id ) );
		$this->assertArrayHasKey( $partial->id, $this->selective_refresh->partials() );

		$this->selective_refresh->remove_partial( $partial->id );
		$this->assertEmpty( $this->selective_refresh->get_partial( $partial->id ) );
		$this->assertArrayNotHasKey( $partial->id, $this->selective_refresh->partials() );

		$partial = new WP_Customize_Partial( $this->selective_refresh, 'bar' );
		$this->assertEquals( $partial, $this->selective_refresh->add_partial( $partial ) );
		$this->assertEquals( $partial, $this->selective_refresh->get_partial( 'bar' ) );
		$this->assertEqualSets( array( 'bar' ), array_keys( $this->selective_refresh->partials() ) );

		// @todo Test applying of customize_dynamic_partial_args filter.
		// @todo Test applying of customize_dynamic_partial_class filter.
	}

	/**
	 * Test WP_Customize_Selective_Refresh::init_preview().
	 *
	 * @see WP_Customize_Selective_Refresh::init_preview()
	 */
	function test_init_preview() {
		$this->selective_refresh->init_preview();
		$this->assertEquals( 10, has_action( 'template_redirect', array( $this->selective_refresh, 'handle_render_partials_request' ) ) );
		$this->assertEquals( 10, has_action( 'wp_enqueue_scripts', array( $this->selective_refresh, 'enqueue_preview_scripts' ) ) );
	}

	/**
	 * Test WP_Customize_Selective_Refresh::enqueue_pane_scripts().
	 *
	 * @see WP_Customize_Selective_Refresh::enqueue_pane_scripts()
	 */
	function test_enqueue_pane_scripts() {
		$scripts = wp_scripts();
		$this->assertNotContains( 'customize-controls-hacks', $scripts->queue );
		$this->selective_refresh->enqueue_pane_scripts();
		$this->assertContains( 'customize-controls-hacks', $scripts->queue );
	}

	/**
	 * Test WP_Customize_Selective_Refresh::enqueue_preview_scripts().
	 *
	 * @see WP_Customize_Selective_Refresh::enqueue_preview_scripts()
	 */
	function test_enqueue_preview_scripts() {
		$scripts = wp_scripts();
		$this->assertNotContains( 'customize-selective-refresh', $scripts->queue );
		$this->selective_refresh->enqueue_preview_scripts();
		$this->assertContains( 'customize-selective-refresh', $scripts->queue );
		$this->assertEquals( 1000, has_action( 'wp_footer', array( $this->selective_refresh, 'export_preview_data' ) ) );
	}

	/**
	 * Test WP_Customize_Selective_Refresh::export_preview_data().
	 *
	 * @see WP_Customize_Selective_Refresh::export_preview_data()
	 */
	function test_export_preview_data() {
		$this->selective_refresh->add_partial( 'blogname', array(
			'selector' => '#site-title',
		) );
		ob_start();
		$this->selective_refresh->export_preview_data();
		$html = ob_get_clean();
		$this->assertTrue( (bool) preg_match( '/_customizePartialRefreshExports = ({.+})/s', $html, $matches ) );
		$exported_data = json_decode( $matches[1], true );
		$this->assertInternalType( 'array', $exported_data );
		$this->assertArrayHasKey( 'partials', $exported_data );
		$this->assertInternalType( 'array', $exported_data['partials'] );
		$this->assertArrayHasKey( 'blogname', $exported_data['partials'] );
		$this->assertEquals( '#site-title', $exported_data['partials']['blogname']['selector'] );
		$this->assertArrayHasKey( 'renderQueryVar', $exported_data );
		$this->assertArrayHasKey( 'l10n', $exported_data );
	}

	/**
	 * Test WP_Customize_Selective_Refresh::add_dynamic_partials().
	 *
	 * @see WP_Customize_Selective_Refresh::add_dynamic_partials()
	 */
	function test_add_dynamic_partials() {
		$this->markTestIncomplete();
	}

	/**
	 * Test WP_Customize_Selective_Refresh::is_render_partials_request().
	 *
	 * @see WP_Customize_Selective_Refresh::is_render_partials_request()
	 */
	function test_is_render_partials_request() {
		$this->assertFalse( $this->selective_refresh->is_render_partials_request() );
		$_POST[ WP_Customize_Selective_Refresh::RENDER_QUERY_VAR ] = '1';
		$this->assertTrue( $this->selective_refresh->is_render_partials_request() );
	}

	/**
	 * Test WP_Customize_Selective_Refresh::handle_render_partials_request().
	 *
	 * @see WP_Customize_Selective_Refresh::handle_render_partials_request()
	 */
	function test_handle_render_partials_request() {
		$this->markTestIncomplete();
	}

	/**
	 * Tear down.
	 */
	function tearDown() {
		$this->wp_customize = null;
		unset( $GLOBALS['wp_customize'] );
		unset( $GLOBALS['wp_scripts'] );
		parent::tearDown();
	}
}
