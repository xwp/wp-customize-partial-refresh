wp.customize.navMenusPreview = wp.customize.MenusCustomizerPreview = ( function( $, _, wp, api ) {
	'use strict';

	var self = {};

	/**
	 * Initialize nav menus preview.
	 */
	self.init = function() {
		var self = this;

		self.watchNavMenuLocationChanges();

		api.preview.bind( 'active', function() {
			self.highlightControls();
		} );
	};

	/**
	 * Partial representing an invocation of wp_nav_menu().
	 *
	 * @class
	 * @augments wp.customize.selectiveRefresh.Partial
	 * @since 4.5.0
	 */
	self.NavMenuInstancePartial = api.selectiveRefresh.Partial.extend({

		/**
		 * Constructor.
		 *
		 * @since 4.5.0
		 * @param {string} id - Partial ID.
		 * @param {Object} options
		 * @param {Object} options.params
		 * @param {Object} options.params.navMenuArgs
		 * @param {string} options.params.navMenuArgs.args_hmac
		 * @param {string} [options.params.navMenuArgs.theme_location]
		 * @param {number} [options.params.navMenuArgs.menu]
		 * @param {object} [options.constructingContainerContext]
		 */
		initialize: function( id, options ) {
			var partial = this, matches, argsHmac;
			matches = id.match( /^nav_menu_instance\[([0-9a-f]{32})]$/ );
			if ( ! matches ) {
				throw new Error( 'Illegal id for nav_menu_instance partial. The key corresponds with the args HMAC.' );
			}
			argsHmac = matches[1];

			options = options || {};
			options.params = _.extend(
				{
					selector: '[data-customize-partial-id="' + id + '"]',
					navMenuArgs: options.constructingContainerContext || {},
					containerInclusive: true
				},
				options.params || {}
			);
			api.selectiveRefresh.Partial.prototype.initialize.call( partial, id, options );

			if ( ! _.isObject( partial.params.navMenuArgs ) ) {
				throw new Error( 'Missing navMenuArgs' );
			}
			if ( partial.params.navMenuArgs.args_hmac !== argsHmac ) {
				throw new Error( 'args_hmac mismatch with id' );
			}
		},

		/**
		 * Return whether the setting is related to this partial.
		 *
		 * @since 4.5.0
		 * @param {wp.customize.Value|string} setting  - Object or ID.
		 * @param {number|object|false|null}  newValue - New value, or null if the setting was just removed.
		 * @param {number|object|false|null}  oldValue - Old value, or null if the setting was just added.
		 * @returns {boolean}
		 */
		isRelatedSetting: function( setting, newValue, oldValue ) {
			var partial = this, navMenuLocationSetting, navMenuId;
			if ( _.isString( setting ) ) {
				setting = api( setting );
			}

			if ( partial.params.navMenuArgs.theme_location ) {
				if ( 'nav_menu_locations[' + partial.params.navMenuArgs.theme_location + ']' === setting.id ) {
					return true;
				}
				navMenuLocationSetting = api( 'nav_menu_locations[' + partial.params.navMenuArgs.theme_location + ']' );
			}

			navMenuId = partial.params.navMenuArgs.menu;
			if ( ! navMenuId && navMenuLocationSetting ) {
				navMenuId = navMenuLocationSetting();
			}

			if ( ! navMenuId ) {
				return false;
			}
			return (
				( 'nav_menu[' + navMenuId + ']' === setting.id ) ||
				( /^nav_menu_item\[/.test( setting.id ) &&
					( ( newValue && newValue.nav_menu_term_id === navMenuId ) || ( oldValue && oldValue.nav_menu_term_id === navMenuId ) )
				)
			);
		},

		/**
		 * Render content.
		 *
		 * @inheritdoc
		 * @param {wp.customize.selectiveRefresh.Placement} placement
		 */
		renderContent: function( placement ) {
			var partial = this, previousContainer = placement.container;
			if ( api.selectiveRefresh.Partial.prototype.renderContent.call( partial, placement ) ) {

				// Trigger deprecated event.
				$( document ).trigger( 'customize-preview-menu-refreshed', [ {
					instanceNumber: null, // @deprecated
					wpNavArgs: placement.context, // @deprecated
					wpNavMenuArgs: placement.context,
					oldContainer: previousContainer,
					newContainer: placement.container
				} ] );
			}
		}
	});

	api.selectiveRefresh.partialConstructor.nav_menu_instance = self.NavMenuInstancePartial;

	/**
	 * Connect nav menu items with their corresponding controls in the pane.
	 *
	 * Setup shift-click on nav menu items which are more granular than the nav menu partial itself.
	 * Also this applies even if a nav menu is not partial-refreshable.
	 *
	 * @since 4.5.0
	 */
	self.highlightControls = function() {
		var selector = '.menu-item';

		// Focus on the menu item control when shift+clicking the menu item.
		$( document ).on( 'click', selector, function( e ) {
			var navMenuItemParts;
			if ( ! e.shiftKey ) {
				return;
			}

			navMenuItemParts = $( this ).attr( 'class' ).match( /(?:^|\s)menu-item-(\d+)(?:\s|$)/ );
			if ( navMenuItemParts ) {
				e.preventDefault();
				e.stopPropagation(); // Make sure a sub-nav menu item will get focused instead of parent items.
				api.preview.send( 'focus-nav-menu-item-control', parseInt( navMenuItemParts[1], 10 ) );
			}
		});
	};

	/**
	 * Watch for changes to nav_menu_locations[] settings.
	 *
	 * Refresh partials associated with the given nav_menu_locations[] setting,
	 * or request an entire preview refresh if there are no containers in the
	 * document for a partial associated with the theme location.
	 *
	 * @since 4.5.0
	 */
	self.watchNavMenuLocationChanges = function() {
		api.bind( 'change', function( setting ) {
			var themeLocation, themeLocationPartialFound = false, matches = setting.id.match( /^nav_menu_locations\[(.+)]$/ );
			if ( ! matches ) {
				return;
			}
			themeLocation = matches[1];
			api.selectiveRefresh.partial.each( function( partial ) {
				if ( partial.extended( self.NavMenuInstancePartial ) && partial.params.navMenuArgs.theme_location === themeLocation ) {
					partial.refresh();
					themeLocationPartialFound = true;
				}
			} );

			if ( ! themeLocationPartialFound ) {
				api.selectiveRefresh.requestFullRefresh();
			}
		} );
	};

	api.bind( 'preview-ready', function() {
		self.init();
	} );

	return self;

}( jQuery, _, wp, wp.customize ) );
