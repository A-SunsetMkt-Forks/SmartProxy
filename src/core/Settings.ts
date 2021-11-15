﻿/*
 * This file is part of SmartProxy <https://github.com/salarcode/SmartProxy>,
 * Copyright (C) 2021 Salar Khalilzadeh <salar2k@gmail.com>
 *
 * SmartProxy is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3 as
 * published by the Free Software Foundation.
 *
 * SmartProxy is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with SmartProxy.  If not, see <http://www.gnu.org/licenses/>.
 */
import { PolyFill } from '../lib/PolyFill';
import {
	ProxyRuleType,
	proxyServerProtocols,
	ProxyServer,
	GeneralOptions,
	SettingsConfig,
	SmartProfileTypeBuiltinIds,
	getBuiltinSmartProfiles,
	SettingsActive,
	SmartProfileCompiled,
} from './definitions';
import { Debug } from '../lib/Debug';
import { SettingsOperation } from './SettingsOperation';
import { browser } from '../lib/environment';
import { Utils } from '../lib/Utils';
import { ProfileOperations } from './ProfileOperations';

export class Settings {
	public static current: SettingsConfig;

	public static active: SettingsActive;

	public static currentOptionsSyncSettings: boolean = true;

	public static onInitialized: Function = null;

	public static initialize() {
		Settings.current = new SettingsConfig();

		PolyFill.storageLocalGet(null, Settings.onInitializeGetLocalData, Settings.onInitializeGetLocalError);

		// handle synced settings changes
		browser.storage.onChanged.addListener(SettingsOperation.syncOnChanged);
	}

	private static onInitializeGetLocalData(data: any) {
		Settings.setDefaultSettings(data);
		Settings.migrateFromOldVersion(data);
		Settings.current = data;

		// read all the synced data along with synced ones
		PolyFill.storageSyncGet(null, Settings.onInitializeGetSyncData, Settings.onInitializeGetSyncError);
	}

	private static onInitializeGetLocalError(error: any) {
		Debug.error(`settingsOperation.initialize error: ${error.message}`);
	}

	private static onInitializeGetSyncData(data: any) {
		try {
			let syncedSettings = Utils.decodeSyncData(data);

			// only if sync settings is enabled
			if (syncedSettings && syncedSettings.options) {
				if (syncedSettings.options.syncSettings) {
					// use synced settings
					Settings.setDefaultSettings(syncedSettings);
					Settings.migrateFromOldVersion(syncedSettings);
					Settings.revertSyncOptions(syncedSettings);

					Settings.current = syncedSettings;
				} else {
					// sync is disabled
					syncedSettings.options.syncSettings = false;
				}

				Settings.currentOptionsSyncSettings = syncedSettings.options.syncSettings;
				Settings.updateActiveSettings();
			}
		} catch (e) {
			Debug.error(`settingsOperation.readSyncedSettings> onGetSyncData error: ${e} \r\n ${data}`);
		}

		if (Settings.onInitialized) Settings.onInitialized();
	}

	private static onInitializeGetSyncError(error: Error) {
		Debug.error(`settingsOperation.readSyncedSettings error: ${error.message}`);
	}

	public static setDefaultSettings(config: SettingsConfig) {
		config.product = 'SmartProxy';
		config.version = null;
		if (config['activeProfileId'] == null) {
			config.activeProfileId = SmartProfileTypeBuiltinIds.Direct;
		}
		if (config['defaultProxyServerId'] == null) {
			config.defaultProxyServerId = null;
		}
		if (config['options'] == null) {
			config.options = new GeneralOptions();
		}
		if (config['firstEverInstallNotified'] == null) {
			config.firstEverInstallNotified = false;
		}
		if (config['proxyServers'] == null || !Array.isArray(config.proxyServers)) {
			config.proxyServers = [];
		}
		if (config['proxyProfiles'] == null || !Array.isArray(config.proxyProfiles)) {
			config.proxyProfiles = getBuiltinSmartProfiles();
		}
		if (config['proxyServerSubscriptions'] == null || !Array.isArray(config.proxyServerSubscriptions)) {
			config.proxyServerSubscriptions = [];
		}

		PolyFill.managementGetSelf((info: any) => {
			config.version = info.version;
		}, null);
	}

	public static migrateFromOldVersion(config: SettingsConfig) {
		if (!config) return;

		let oldConfig: any = config;

		if (config.version < '0.9.11') {
		} else if (config.version < '') {
			if (oldConfig.proxyRules && oldConfig.proxyRules.length > 0) {
				for (const rule of oldConfig.proxyRules) {
					rule.rulePattern = rule['rulePattern'] || rule['pattern'];
					rule.hostName = rule['hostName'] || rule['source'] || rule['sourceDomain'] || null;
					if (rule.ruleType == null) rule.ruleType = ProxyRuleType.MatchPatternUrl;
				}
			}
		}
	}

	/** In local options if sync is disabled for these particular options, don't update them from sync server */
	public static revertSyncOptions(syncedConfig: SettingsConfig) {
		let settings = Settings.current;

		syncedConfig.options.syncActiveProxy = settings.options.syncActiveProxy;
		syncedConfig.options.syncActiveProfile = settings.options.syncActiveProfile;

		if (!settings.options.syncActiveProxy) {
			syncedConfig.defaultProxyServerId = settings.defaultProxyServerId;
		}
		if (!settings.options.syncActiveProfile) {
			syncedConfig.activeProfileId = settings.activeProfileId;
		}
	}

	public static validateProxyServer(
		server: ProxyServer,
		checkExistingName: boolean = true,
	): {
		success: boolean;
		exist?: boolean;
		message?: string;
		result?: any;
	} {
		if (server.port <= 0 || server.port >= 65535) {
			return {
				success: false,
				message: browser.i18n.getMessage('settingsServerPortInvalid').replace('{0}', `${server.host}:${server.port}`),
			};
		}

		if (!server.host || !Utils.isValidHost(server.host)) {
			return {
				success: false,
				message: browser.i18n.getMessage('settingsServerHostInvalid').replace('{0}', `${server.host}:${server.port}`),
			};
		}

		if (!server.name) {
			return { success: false, message: browser.i18n.getMessage('settingsServerNameRequired') };
		} else if (Settings.current) {
			if (checkExistingName) {
				const currentServers = Settings.current.proxyServers;

				for (let srv of currentServers) {
					if (srv.name == server.name) {
						return { success: false, exist: true, message: `Server name ${server.name} already exists` };
					}
				}
			}
		}

		if (!server.protocol) {
			server.protocol = 'HTTP';
		} else {
			server.protocol = server.protocol.toUpperCase();
			if (proxyServerProtocols.indexOf(server.protocol) == -1) {
				// not valid protocol, resetting
				server.protocol = 'HTTP';
			}
		}

		return { success: true };
	}

	public static updateActiveSettings(fallback: boolean = true) {
		/** Updating `Settings.active` */

		let settings = Settings.current;
		if (!settings)
			return;

		let active = Settings.active ?? (Settings.active = new SettingsActive());

		let foundProfile = ProfileOperations.findSmartProfileById(settings.activeProfileId, settings.proxyProfiles);
		if (!foundProfile && fallback) {
			foundProfile = ProfileOperations.findSmartProfileById(SmartProfileTypeBuiltinIds.Direct, settings.proxyProfiles);
		}

		let activeProfile: SmartProfileCompiled = null;
		if (foundProfile) {
			active.activeProfile = ProfileOperations.compileSmartProfile(foundProfile);
			activeProfile = active.activeProfile;
		}

		active.currentProxyServer = null;
		if (activeProfile?.profileProxyServer) {
			active.currentProxyServer = active.activeProfile.profileProxyServer;
		}

		if (!active.currentProxyServer) {
			let foundProxy = SettingsOperation.findProxyServerById(settings.defaultProxyServerId);
			if (foundProxy) {
				active.currentProxyServer = foundProxy;
			}
		}
	}
}
