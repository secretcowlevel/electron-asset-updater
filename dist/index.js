"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ElectronAssetUpdater = void 0;

class ElectronAssetUpdater {
  constructor(options) {
    const VALID_OPTIONS = ['remote', 'assets', 'log', 'appData'];

    if (!Object.keys(options).every(el => VALID_OPTIONS.includes(el))) {
      throw new Error(`Invalid options passed to constructor. Must be one of ${JSON.stringify(VALID_OPTIONS)}. Received ${JSON.stringify(Object.keys(options))}`);
    }
  }

}

exports.ElectronAssetUpdater = ElectronAssetUpdater;
