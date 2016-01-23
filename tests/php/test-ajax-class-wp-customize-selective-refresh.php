<?php

class Test_Ajax_WP_Customize_Selective_Refresh extends WP_Ajax_UnitTestCase {

	/**
	 * @var WP_Customize_Manager
	 */
	public $wp_customize;

	/**
	 * @var WP_Customize_Partial_Refresh_Plugin
	 */
	public $plugin;

	/**
	 * @var WP_Customize_Selective_Refresh
	 */
	public $selective_refresh;

	/**
	 * Set up the test fixture.
	 */
	public function setUp() {
		parent::setUp();
		require_once ABSPATH . WPINC . '/class-wp-customize-manager.php';
		$GLOBALS['wp_customize'] = new WP_Customize_Manager();
		$this->wp_customize = $GLOBALS['wp_customize'];
		wp_set_current_user( $this->factory->user->create( array( 'role' => 'administrator' ) ) );
		$this->plugin = $GLOBALS['wp_customize_partial_refresh_plugin'];
		$this->selective_refresh = new WP_Customize_Selective_Refresh( $this->plugin );
		remove_action( 'after_setup_theme', 'twentyfifteen_setup' );
	}

	function tearDown() {
		$this->wp_customize = null;
		$this->manager = null;
		unset( $GLOBALS['wp_customize'] );
		unset( $GLOBALS['wp_scripts'] );
		unset( $_SERVER['REQUEST_METHOD'] );
		unset( $_REQUEST['wp_customize'] );
		parent::tearDown();
	}

	function do_customize_boot_actions() {
		$_SERVER['REQUEST_METHOD'] = 'POST';
		do_action( 'setup_theme' );
		$_REQUEST['nonce'] = wp_create_nonce( 'preview-customize_' . $this->wp_customize->theme()->get_stylesheet() );
		do_action( 'after_setup_theme' );
		do_action( 'init' );
		do_action( 'wp_loaded' );
		do_action( 'wp', $GLOBALS['wp'] );
		$_REQUEST['wp_customize'] = 'on';
	}

	/**
	 * Helper to keep it DRY
	 *
	 * @param string $action Action.
	 */
	protected function make_ajax_call( $action ) {
		// Make the request.
		try {
			$this->_handleAjax( $action );
		} catch ( WPAjaxDieContinueException $e ) {
			unset( $e );
		}
	}

	/**
	 * Testing capabilities check for the refresh method
	 */
	function test_ajax_refresh_nonce_check() {
		$this->do_customize_boot_actions();
		$_POST = array(
			'action' => WP_Customize_Selective_Refresh::AJAX_ACTION,
			'nonce' => 'bad-nonce-12345',
		);

		$this->make_ajax_call( WP_Customize_Selective_Refresh::AJAX_ACTION );

		// Get the results.
		$response = json_decode( $this->_last_response, true );
		$expected_results = array(
			'success' => false,
			'data'    => 'bad_nonce',
		);

		$this->assertSame( $expected_results, $response );
	}

	/**
	 * Testing capabilities check for the refresh method
	 *
	 * @dataProvider data_refresh_cap_check
	 *
	 * @param string $role              The role we're checking caps against.
	 * @param array  $expected_results  Expected results.
	 */
	function test_ajax_refresh_cap_check( $role, $expected_results ) {
		$this->do_customize_boot_actions();
		wp_set_current_user( $this->factory->user->create( array( 'role' => $role ) ) );

		$_POST = array(
			'action' => WP_Customize_Selective_Refresh::AJAX_ACTION,
			'nonce' => wp_create_nonce( WP_Customize_Selective_Refresh::AJAX_ACTION ),
		);

		$this->make_ajax_call( WP_Customize_Selective_Refresh::AJAX_ACTION );

		// Get the results.
		$response = json_decode( $this->_last_response, true );

		$this->assertSame( $expected_results, $response );
	}

	/**
	 * Data provider for test_ajax_refresh_cap_check().
	 *
	 * Provides various post_args to induce error messages that can be
	 * compared to the expected_results.
	 *
	 * @return array {
	 *     @type array {
	 *         @string string $role             The role that will test caps for.
	 *         @array  array  $expected_results The expected results from the ajax call.
	 *     }
	 * }
	 */
	function data_refresh_cap_check() {
		return array(
			array(
				'subscriber',
				array(
					'success' => false,
					'data'    => 'customize_not_allowed',
				),
			),
			array(
				'contributor',
				array(
					'success' => false,
					'data'    => 'customize_not_allowed',
				),
			),
			array(
				'author',
				array(
					'success' => false,
					'data'    => 'customize_not_allowed',
				),
			),
			array(
				'editor',
				array(
					'success' => false,
					'data'    => 'customize_not_allowed',
				),
			),
			array(
				'administrator',
				array(
					'success' => false,
					'data'    => 'missing_setting_ids',
				),
			),
		);
	}

	/**
	 * Testing bad_setting_ids for the refresh method
	 */
	function test_ajax_refresh_bad_setting_ids() {
		$this->do_customize_boot_actions();
		wp_set_current_user( $this->factory->user->create( array( 'role' => 'administrator' ) ) );

		$_POST = array(
			'action' => WP_Customize_Selective_Refresh::AJAX_ACTION,
			'nonce' => wp_create_nonce( WP_Customize_Selective_Refresh::AJAX_ACTION ),
			'setting_ids' => 'foo',
		);

		$this->make_ajax_call( WP_Customize_Selective_Refresh::AJAX_ACTION );

		// Get the results.
		$response = json_decode( $this->_last_response, true );
		$expected_results = array(
			'success' => false,
			'data'    => 'bad_setting_ids',
		);

		$this->assertSame( $expected_results, $response );
	}

	/**
	 * Test unrecognized_setting for the refresh method
	 */
	function test_ajax_refresh_unrecognized_setting() {
		$this->do_customize_boot_actions();
		wp_set_current_user( $this->factory->user->create( array( 'role' => 'administrator' ) ) );

		$_POST = array(
			'action' => WP_Customize_Selective_Refresh::AJAX_ACTION,
			'nonce' => wp_create_nonce( WP_Customize_Selective_Refresh::AJAX_ACTION ),
			'setting_ids' => array( 'foo' ),
		);

		$this->make_ajax_call( WP_Customize_Selective_Refresh::AJAX_ACTION );

		// Get the results.
		$response = json_decode( $this->_last_response, true );
		$expected_results = array(
			'success' => true,
			'data' => array(
				'foo' => array(
					'error' => 'unrecognized_setting',
				),
			),
		);

		$this->assertSame( $expected_results, $response );
	}

	/**
	 * Test a successful response for the refresh method
	 */
	function test_ajax_refresh_success() {
		$this->do_customize_boot_actions();
		wp_set_current_user( $this->factory->user->create( array( 'role' => 'administrator' ) ) );
		$this->wp_customize->add_setting( 'foo', array(
			'default'   => 'arbitrary-value'
		) );

		$_POST = array(
			'action' => WP_Customize_Selective_Refresh::AJAX_ACTION,
			'nonce' => wp_create_nonce( WP_Customize_Selective_Refresh::AJAX_ACTION ),
			'setting_ids' => array( 'foo' ),
		);

		$this->make_ajax_call( WP_Customize_Selective_Refresh::AJAX_ACTION );

		// Get the results.
		$response = json_decode( $this->_last_response, true );
		$expected_results = array(
			'success' => true,
			'data' => array(
				'foo' => array(
					'data' => 'arbitrary-value',
				),
			),
		);

		$this->assertSame( $expected_results, $response );
	}

	/**
	 * Test a successful filtered response for the refresh method
	 */
	function test_ajax_refresh_success_filtered() {
		$this->do_customize_boot_actions();
		wp_set_current_user( $this->factory->user->create( array( 'role' => 'administrator' ) ) );
		$this->wp_customize->add_setting( 'foo', array(
			'default'   => 'arbitrary-value',
		) );

		$_POST = array(
			'action' => WP_Customize_Selective_Refresh::AJAX_ACTION,
			'nonce' => wp_create_nonce( WP_Customize_Selective_Refresh::AJAX_ACTION ),
			'setting_ids' => array( 'foo' ),
		);

		add_filter( 'customize_setting_render_foo', array( $this, 'filter_foo' ), 10, 2 );
		$this->make_ajax_call( WP_Customize_Selective_Refresh::AJAX_ACTION );

		// Get the results.
		$response = json_decode( $this->_last_response, true );
		$expected_results = array(
			'success' => true,
			'data' => array(
				'foo' => array(
					'data' => 'new-value',
				),
			),
		);

		$this->assertSame( $expected_results, $response );
	}

	/**
	 * Helper method to filte the rendered value of the foo setting.
	 */
	function filter_foo( $rendered, $setting ) {
		return 'new-value';
	}
}
