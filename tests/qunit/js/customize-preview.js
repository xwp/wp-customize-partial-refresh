/* global wp, test, module, ok, equal */

jQuery( window ).load( function() {

	var api = wp.customize;

	module( 'Customize Preview' );

	test( 'Fixture should be present', function() {
		ok( api.settings );
		equal( api.settings.channel, 'preview-0' );
	} );

	test( 'Setting has fixture value', function() {
		equal( wp.customize( 'fixture-control' ).get(), 'Lorem Ipsum' );
	} );
} );
