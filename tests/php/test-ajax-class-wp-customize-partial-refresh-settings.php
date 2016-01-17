<?php

class Test_Ajax_WP_Customize_Partial_Refresh_Settings extends WP_Ajax_UnitTestCase {

	/**
	 * @var WP_Customize_Manager
	 */
	public $wp_customize;

	/**
	 * @var WP_Customize_Partial_Refresh_Plugin
	 */
	public $plugin;

	/**
	 * @var WP_Customize_Partial_Refresh_Settings
	 */
	public $settings;

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
		$this->settings = new WP_Customize_Partial_Refresh_Settings( $this->plugin );
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
			'action' => WP_Customize_Partial_Refresh_Settings::AJAX_ACTION,
			'nonce' => 'bad-nonce-12345',
		);

		$this->make_ajax_call( WP_Customize_Partial_Refresh_Settings::AJAX_ACTION );

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
			'action' => WP_Customize_Partial_Refresh_Settings::AJAX_ACTION,
			'nonce' => wp_create_nonce( WP_Customize_Partial_Refresh_Settings::AJAX_ACTION ),
		);

		$this->make_ajax_call( WP_Customize_Partial_Refresh_Settings::AJAX_ACTION );

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
					'data'    => 'missing_setting_id',
				),
			),
		);
	}

	/**
	 * Testing missing_customized for the refresh method
	 */
	function test_ajax_refresh_customized() {
		$this->do_customize_boot_actions();
		wp_set_current_user( $this->factory->user->create( array( 'role' => 'administrator' ) ) );

		$_POST = array(
			'action' => WP_Customize_Partial_Refresh_Settings::AJAX_ACTION,
			'nonce' => wp_create_nonce( WP_Customize_Partial_Refresh_Settings::AJAX_ACTION ),
			'setting_id' => 'foo',
		);

		$this->make_ajax_call( WP_Customize_Partial_Refresh_Settings::AJAX_ACTION );

		// Get the results.
		$response = json_decode( $this->_last_response, true );
		$expected_results = array(
			'success' => false,
			'data'    => 'missing_customized',
		);

		$this->assertSame( $expected_results, $response );
	}

	/**
	 * Test setting_not_found for the refresh method
	 */
	function test_ajax_refresh_setting_not_found() {
		$this->do_customize_boot_actions();
		wp_set_current_user( $this->factory->user->create( array( 'role' => 'administrator' ) ) );

		$_POST = array(
			'action' => WP_Customize_Partial_Refresh_Settings::AJAX_ACTION,
			'nonce' => wp_create_nonce( WP_Customize_Partial_Refresh_Settings::AJAX_ACTION ),
			'setting_id' => 'foo',
			'customized' => '{"foo":{"value":"custom","dirty":true}}',
		);

		$this->make_ajax_call( WP_Customize_Partial_Refresh_Settings::AJAX_ACTION );

		// Get the results.
		$response = json_decode( $this->_last_response, true );
		$expected_results = array(
			'success' => false,
			'data'    => 'setting_not_found',
		);

		$this->assertSame( $expected_results, $response );
	}

	/**
	 * Test setting_selector_not_found for the refresh method
	 */
	function test_ajax_refresh_setting_selector_not_found() {
		$this->do_customize_boot_actions();
		wp_set_current_user( $this->factory->user->create( array( 'role' => 'administrator' ) ) );
		$this->wp_customize->add_setting( 'foo', array(
			'default'   => 'default',
			'transport' => 'partialRefresh',
		) );

		$_POST = array(
			'action' => WP_Customize_Partial_Refresh_Settings::AJAX_ACTION,
			'nonce' => wp_create_nonce( WP_Customize_Partial_Refresh_Settings::AJAX_ACTION ),
			'setting_id' => 'foo',
			'customized' => '{"foo":{"value":"custom","dirty":true}}',
		);

		$this->make_ajax_call( WP_Customize_Partial_Refresh_Settings::AJAX_ACTION );

		// Get the results.
		$response = json_decode( $this->_last_response, true );
		$expected_results = array(
			'success' => false,
			'data'    => 'setting_selector_not_found',
		);

		$this->assertSame( $expected_results, $response );
	}

	/**
	 * Test missing_required_filter for the refresh method
	 */
	function test_ajax_refresh_missing_required_filter() {
		$this->do_customize_boot_actions();
		wp_set_current_user( $this->factory->user->create( array( 'role' => 'administrator' ) ) );
		$this->wp_customize->add_setting( 'foo', array(
			'default'   => 'default',
			'transport' => 'partialRefresh',
		) );
		$this->wp_customize->get_setting( 'foo' )->selector  = '.foo';

		$_POST = array(
			'action' => WP_Customize_Partial_Refresh_Settings::AJAX_ACTION,
			'nonce' => wp_create_nonce( WP_Customize_Partial_Refresh_Settings::AJAX_ACTION ),
			'setting_id' => 'foo',
			'customized' => '{"foo":{"value":"custom","dirty":true}}',
		);

		$this->make_ajax_call( WP_Customize_Partial_Refresh_Settings::AJAX_ACTION );

		// Get the results.
		$response = json_decode( $this->_last_response, true );
		$expected_results = array(
			'success' => false,
			'data'    => 'missing_required_filter',
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
			'default'   => 'default',
			'transport' => 'partialRefresh',
		) );
		$this->wp_customize->get_setting( 'foo' )->selector  = '.foo';

		$_POST = array(
			'action' => WP_Customize_Partial_Refresh_Settings::AJAX_ACTION,
			'nonce' => wp_create_nonce( WP_Customize_Partial_Refresh_Settings::AJAX_ACTION ),
			'setting_id' => 'foo',
			'customized' => '{"foo":{"value":"custom","dirty":true}}',
		);

		add_filter( 'customize_partial_refresh_foo', '__return_true' );
		$this->make_ajax_call( WP_Customize_Partial_Refresh_Settings::AJAX_ACTION );

		// Get the results.
		$response = json_decode( $this->_last_response, true );
		$expected_results = array(
			'success' => true,
			'data'    => true,
		);

		$this->assertSame( $expected_results, $response );
	}
}
