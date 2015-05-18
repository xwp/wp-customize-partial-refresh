/*global jQuery, JSON, _wpCustomizePartialRefreshMenusExports, _ */

if ( ! wp.customize.partialPreviewMenus ) {
	wp.customize.partialPreviewMenus = {};
}

wp.customize.partialPreviewMenus.pane = ( function ( $, api ) {
	'use strict';

	var self = {
		ready: $.Deferred()
	};

	$.extend( self, _wpCustomizePartialRefreshMenusExports );

	self.init = function () {

	};

	self.ready.done( function () {

	} );

	api.bind( 'ready', function () {
		self.ready.resolve();
	} );

	self.init();

	return self;
}( jQuery, wp.customize ));

