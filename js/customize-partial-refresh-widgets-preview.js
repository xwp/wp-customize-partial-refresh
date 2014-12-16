/*global jQuery, _wpCustomizePartialRefreshWidgets_exports, _ */
wp.customize.partialPreviewWidgets = ( function ( $, api ) {
	'use strict';

	var self = {
		sidebars_eligible_for_post_message: [],
		widgets_eligible_for_post_message: [],
		render_widget_query_var: null,
		render_widget_nonce_value: null,
		render_widget_nonce_post_key: null,
		preview_customize_nonce: null
	};

	$.extend( self, _wpCustomizePartialRefreshWidgets_exports );

	self.init = function () {
		this.livePreview();
	};

	/**
	 * if the containing sidebar is eligible, and if there are sibling widgets the sidebar currently rendered
	 * @param {String} sidebar_id
	 * @return {Boolean}
	 */
	self.sidebarCanLivePreview = function ( sidebar_id ) {
		var widget_ids, rendered_widget_ids;
		if ( -1 === self.sidebars_eligible_for_post_message.indexOf( sidebar_id ) ) {
			return false;
		}
		widget_ids = wp.customize( self.sidebar_id_to_setting_id( sidebar_id ) )();
		rendered_widget_ids = _( widget_ids ).filter( function ( widget_id ) {
			return 0 !== $( '#' + widget_id ).length;
		} );
		return ( rendered_widget_ids.length !== 0 );
	};

	/**
	 * We can only know if a sidebar can be live-previewed by letting the
	 * preview tell us, so this updates the parent's transports to
	 * postMessage when it is available. If there is a switch from
	 * postMessage to refresh, the preview window will request a refresh.
	 */
	self.refreshTransports = function () {
		var changed_to_refresh = false;
		$.each( _.keys( wp.customize.WidgetCustomizerPreview.renderedSidebars ), function ( i, sidebar_id ) {
			var setting_id, setting, sidebar_transport, widget_ids;

			setting_id = self.sidebar_id_to_setting_id( sidebar_id );
			setting = parent.wp.customize( setting_id ); // @todo Eliminate use of parent by sending messages
			sidebar_transport = self.sidebarCanLivePreview( sidebar_id ) ? 'postMessage' : 'refresh';
			if ( 'refresh' === sidebar_transport && 'postMessage' === setting.transport ) {
				changed_to_refresh = true;
			}
			setting.transport = sidebar_transport;

			widget_ids = wp.customize( setting_id )();
			$.each( widget_ids, function ( i, widget_id ){
				var setting_id, setting, widget_transport, id_base;
				setting_id = self.widget_id_to_setting_id( widget_id );
				setting = parent.wp.customize( setting_id ); // @todo Eliminate use of parent by sending messages
				widget_transport = 'refresh';
				id_base = self.widget_id_to_base( widget_id );
				if ( sidebar_transport === 'postMessage' && ( -1 !== self.widgets_eligible_for_post_message.indexOf( id_base ) ) ) {
					widget_transport = 'postMessage';
				}
				if ( 'refresh' === widget_transport && 'postMessage' === setting.transport ) {
					changed_to_refresh = true;
				}
				setting.transport = widget_transport;
			} );
		} );
		if ( changed_to_refresh ) {
			api.preview.send( 'refresh' );
		}
	};

	/**
	 *
	 */
	self.livePreview = function () {
		var already_bound_widgets, bind_widget_setting;

		already_bound_widgets = {};

		bind_widget_setting = function( widget_id ) {
			var setting_id, binder;

			setting_id = self.widget_id_to_setting_id( widget_id );
			binder = function( value ) {
				var update_count;

				already_bound_widgets[ widget_id ] = true;
				update_count = 0;
				value.bind( function( to, from ) {
					var widget_setting_id, sidebar_id, sidebar_widgets, data, customized;

					// Workaround for http://core.trac.wordpress.org/ticket/26061;
					// once fixed, eliminate initial_value, update_count, and this conditional
					update_count += 1;
					if ( 1 === update_count && _.isEqual( from, to ) ) {
						return;
					}

					widget_setting_id = self.widget_id_to_setting_id( widget_id );
					if ( parent.wp.customize( widget_setting_id ).transport !== 'postMessage' ) { // @todo Eliminate use of parent by sending messages
						return;
					}

					sidebar_id = null;
					sidebar_widgets = [];
					wp.customize.each( function ( setting, setting_id ) {
						var matches = setting_id.match( /^sidebars_widgets\[(.+)\]/ );
						if ( matches && setting().indexOf( widget_id ) !== -1 ) {
							sidebar_id = matches[1];
							sidebar_widgets = setting();
						}
					} );
					if ( ! sidebar_id ) {
						throw new Error( 'Widget does not exist in a sidebar.' );
					}
					data = {
						widget_id: widget_id,
						nonce: self.preview_customize_nonce, // for Customize Preview
						wp_customize: 'on'
					};
					data[ self.render_widget_query_var ] = '1';
					customized = {};
					customized[ self.sidebar_id_to_setting_id( sidebar_id ) ] = sidebar_widgets;
					customized[ setting_id ] = to;
					data.customized = JSON.stringify( customized );
					data[ self.render_widget_nonce_post_key ] = self.render_widget_nonce_value;

					$( '#' + widget_id ).addClass( 'customize-partial-refreshing' );

					$.post( self.request_uri, data, function ( r ) {
						if ( ! r.success ) {
							throw new Error( r.data && r.data.message ? r.data.message : 'FAIL' );
						}
						var old_widget, new_widget, sidebar_widgets, position, before_widget, after_widget;

						// @todo Fire jQuery event to indicate that a widget was updated; here widgets can re-initialize them if they support live widgets
						old_widget = $( '#' + widget_id );
						new_widget = $( r.data.rendered_widget );
						if ( new_widget.length && old_widget.length ) {
							old_widget.replaceWith( new_widget );
						} else if ( ! new_widget.length && old_widget.length ) {
							old_widget.remove();
						} else if ( new_widget.length && ! old_widget.length ) {
							sidebar_widgets = wp.customize( self.sidebar_id_to_setting_id( r.data.sidebar_id ) )();
							position = sidebar_widgets.indexOf( widget_id );
							if ( -1 === position ) {
								throw new Error( 'Unable to determine new widget position in sidebar' );
							}
							if ( sidebar_widgets.length === 1 ) {
								throw new Error( 'Unexpected postMessage for adding first widget to sidebar; refresh must be used instead.' );
							}
							if ( position > 0 ) {
								before_widget = $( '#' + sidebar_widgets[ position - 1 ] );
								before_widget.after( new_widget );
							}
							else {
								after_widget = $( '#' + sidebar_widgets[ position + 1 ] );
								after_widget.before( new_widget );
							}
						}
						api.preview.send( 'widget-updated', widget_id );
						wp.customize.trigger( 'sidebar-updated', sidebar_id );
						wp.customize.trigger( 'widget-updated', widget_id );

						parent.wp.customize.control( setting_id ).active( 0 !== new_widget.length ); // @todo Eliminate use of parent by sending messages
						self.refreshTransports();
					} );
				} );
			};
			wp.customize( setting_id, binder );
			already_bound_widgets[setting_id] = binder;
		};

		$.each( _.keys( wp.customize.WidgetCustomizerPreview.renderedSidebars ), function ( i, sidebar_id ) {
			var setting_id = self.sidebar_id_to_setting_id( sidebar_id );
			wp.customize( setting_id, function( value ) {
				var update_count = 0;
				value.bind( function( to, from ) {
					// Workaround for http://core.trac.wordpress.org/ticket/26061;
					// once fixed, eliminate initial_value, update_count, and this conditional
					update_count += 1;
					if ( 1 === update_count && _.isEqual( from, to ) ) {
						return;
					}

					// Sort widgets
					// @todo instead of appending to the parent, we should append relative to the first widget found
					$.each( to, function ( i, widget_id ) {
						var widget = $( '#' + widget_id );
						widget.parent().append( widget );
					} );

					// Create settings for newly-created widgets
					$.each( to, function ( i, widget_id ) {
						var setting_id, setting, parent_setting;

						setting_id = self.widget_id_to_setting_id( widget_id );
						setting = wp.customize( setting_id );
						if ( ! setting ) {
							setting = wp.customize.create( setting_id, {} );
						}

						// @todo Is there another way to check if we bound?
						if ( ! already_bound_widgets[widget_id] ) {
							bind_widget_setting( widget_id );
						}

						// Force the callback to fire if this widget is newly-added
						if ( from.indexOf( widget_id ) === -1 ) {
							self.refreshTransports();
							parent_setting = parent.wp.customize( setting_id );
							if ( 'postMessage' === parent_setting.transport ) {
								setting.callbacks.fireWith( setting, [ setting(), null ] );
							} else {
								api.preview.send( 'refresh' );
							}
						}
					} );

					// Remove widgets (their DOM element and their setting) when removed from sidebar
					$.each( from, function ( i, old_widget_id ) {
						if ( -1 === to.indexOf( old_widget_id ) ) {
							var setting_id = self.widget_id_to_setting_id( old_widget_id );
							if ( wp.customize.has( setting_id ) ) {
								wp.customize.remove( setting_id );
								// @todo WARNING: If a widget is moved to another sidebar, we need to either not do this, or force a refresh when a widget is  moved to another sidebar
							}
							$( '#' + old_widget_id ).remove();
						}
					} );

					// If a widget was removed so that no widgets remain rendered in sidebar, we need to disable postMessage
					self.refreshTransports();
					wp.customize.trigger( 'sidebar-updated', sidebar_id );
				} );
			} );
		} );

		$.each( wp.customize.WidgetCustomizerPreview.renderedWidgets, function ( widget_id ) {
			var setting_id = self.widget_id_to_setting_id( widget_id );
			if ( ! wp.customize.has( setting_id ) ) {
				// Used to have to do this: wp.customize.create( setting_id, instance );
				// Now that the settings are registered at the `wp` action, it is late enough
				// for all filters to be added, e.g. sidebars_widgets for Widget Visibility
				throw new Error( 'Expected customize to have registered setting for widget ' + widget_id );
			}
			bind_widget_setting( widget_id );
		} );

		// Opt-in to LivePreview
		self.refreshTransports();
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

	$( function () {
		self.init();
	} );

	return self;
}( jQuery, wp.customize ));

