const path = require('path')
const fs = require('fs')
const request = require('request')
const progress = require('request-progress')

export class ElectronAssetUpdater {
  constructor (options) {
    const VALID_OPTIONS = ['remote', 'assets', 'log', 'appData']
    if (!Object.keys(options).every(el => VALID_OPTIONS.includes(el))) {
      throw new Error(`Invalid options passed to constructor. Must be one of ${JSON.stringify(VALID_OPTIONS)}. Received ${JSON.stringify(Object.keys(options))}`)
    }

    this.options = options
  }

  _createTempFolder () {
    const tmpFolder = path.join(this.options.appData, '/tmp')
    if (!fs.existsSync(tmpFolder)) {
      fs.mkdirSync(tmpFolder)
    }
  }

  _gather

  go () {
    // make sure we have a temp folder to download to
    this._createTempFolder()
  }
}
