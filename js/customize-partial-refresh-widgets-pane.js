/*global jQuery, _wpCustomizePartialRefreshWidgets_exports */
wp.customize.partialPreviewWidgets = ( function ( $, api ) {
	'use strict';

	var self = {
		sidebars_eligible_for_post_message: [],
		widgets_eligible_for_post_message: []
	};

	$.extend( self, _wpCustomizePartialRefreshWidgets_exports );

	self.init = function () {

		api.bind( 'add', function ( setting ) {
			var matches, id_base;
			matches = setting.id.match( /^widget_(.+?)\[(\d+)\]$/ );
			if ( ! matches ) {
				return;
			}
			id_base = matches[1];
			if ( -1 !== self.widgets_eligible_for_post_message.indexOf( id_base ) ) {
				setting.transport = 'postMessage';
			}
		} );
	};

	/**
	 * @param {String} widget_id
	 * @returns {String}
	 */
	self.widget_id_to_setting_id = function ( widget_id ) {
		var setting_id, matches;
		setting_id = null;
		matches = widget_id.match(/^(.+?)(?:-(\d+)?)$/);
		if ( matches ) {
			setting_id = 'widget_' + matches[1] + '[' + matches[2] + ']';
		} else {
			setting_id = 'widget_' + widget_id;
		}
		return setting_id;
	};

	/**
	 * @param {String} widget_id
	 * @returns {String}
	 */
	self.widget_id_to_base = function ( widget_id ) {
		return widget_id.replace( /-\d+$/, '' );
	};

	/**
	 * @param {String} sidebar_id
	 * @returns {string}
	 */
	self.sidebar_id_to_setting_id = function ( sidebar_id ) {
		return 'sidebars_widgets[' + sidebar_id + ']';
	};

	api.bind( 'ready', function () {
		self.init();
	} );

	return self;
}( jQuery, wp.customize ));

