"use strict";

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; var ownKeys = Object.keys(source); if (typeof Object.getOwnPropertySymbols === 'function') { ownKeys = ownKeys.concat(Object.getOwnPropertySymbols(source).filter(function (sym) { return Object.getOwnPropertyDescriptor(source, sym).enumerable; })); } ownKeys.forEach(function (key) { _defineProperty(target, key, source[key]); }); } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

const path = require('path');

const fs = require('fs');

const md5file = require('md5-file');

const request = require('request');

const unzip = require('node-unzip-2');

const progress = require('request-progress');

const Bluebird = require('bluebird');

const rimraf = require('rimraf');

const MAX_DOWNLOAD_RETRIES = 5;
const MAX_UNZIP_RETRIES = 5;

const NO_OP = () => {};

const defaultOptions = {
  appData: null,
  log: {
    info: NO_OP,
    error: NO_OP
  },
  remote: null
};

let updaterOptions = _objectSpread({}, defaultOptions); // helper function to download a file


async function downloadFile(filename, progressCb, options = {}) {
  return new Promise(async (resolve, reject) => {
    const remoteFileUri = `${updaterOptions.remote}${filename}`;
    const tmpFilePath = path.join(updaterOptions.appData, `/tmp/${filename}`);
    updaterOptions.log.info(`downloadFile() -> ${tmpFilePath}`);
    updaterOptions.log.info(`Remote URL: ${remoteFileUri}`);

    for (let downloadRetries = 1; downloadRetries <= MAX_DOWNLOAD_RETRIES; downloadRetries++) {
      try {
        await progress((await request(remoteFileUri))).on('progress', state => {
          progressCb(`Transferred ${Math.floor(state.percent * 100)}% (${Math.floor(state.size.transferred / 1000 / 1000)}Mb / ${Math.floor(state.size.total / 1000 / 1000)}Mb)`);
        }).on('error', err => {
          updaterOptions.log.error('ERROR IN GET');

          if (options.errorCb) {
            options.errorCb();
          }

          reject(err);
        }).on('end', async () => {
          updaterOptions.log.info(`${filename} Downloaded!`);

          if (options.zipped) {
            updaterOptions.log.info(`ZIPPED!`);

            for (let unzipRetries = 1; unzipRetries <= MAX_UNZIP_RETRIES; unzipRetries++) {
              try {
                fs.createReadStream(tmpFilePath).pipe(unzip.Extract({
                  path: path.join(updaterOptions.appData, '/assets')
                }));
                break;
              } catch (e) {
                if (unzipRetries <= MAX_UNZIP_RETRIES) {
                  updaterOptions.log.error(`:: Error unzipping ${tmpFilePath}! Retry ${unzipRetries} of ${MAX_UNZIP_RETRIES}.`);
                } else {
                  updaterOptions.log.error(`:: Error unzipping ${tmpFilePath}!`);
                  progressCb('Unzip Failed. Please restart to try again.'); // eslint-disable-line standard/no-callback-literal

                  throw e;
                }
              }
            }
          }

          const data = fs.readFileSync(tmpFilePath);
          md5file(tmpFilePath, (err2, hash) => {
            if (err2) {
              throw new Error('ERROR CREATING MD5');
            }

            updaterOptions.log.info(`MD5 of file: ${hash}`);
            resolve({
              data,
              hash
            });
          });
        }).pipe(fs.createWriteStream(tmpFilePath));
        break;
      } catch (e) {
        if (downloadRetries <= MAX_DOWNLOAD_RETRIES) {
          updaterOptions.log.error(`:: Updating ${filename} failed. Retry ${downloadRetries} of ${MAX_DOWNLOAD_RETRIES}.`);
        } else {
          updaterOptions.log.error(`:: Updating ${filename} failed.`);
          progressCb('Download Failed. Please restart to try again.'); // eslint-disable-line standard/no-callback-literal

          throw e;
        }
      }
    }
  });
}

async function getLocalHash(filename) {
  return new Promise((resolve, reject) => {
    let md5 = null;

    try {
      md5 = fs.readFileSync(path.join(updaterOptions.appData, `/assets/${filename}`), 'utf8');
    } catch (e) {// empty on purpose
    }

    if (md5) {
      updaterOptions.log.info(`Local MD5: ${md5}`);
    } else {
      updaterOptions.log.info(`No local ${filename} md5 found, so forcing download!`);
    }

    resolve(md5);
  });
} // the init function, called before we call the assetUpdater


exports.init = config => {
  updaterOptions = _objectSpread({}, defaultOptions, config);
}; // the main entry point to start the updater


exports.assetUpdater = async function (assets, cb, progressCb = () => null, errorCb = () => null) {
  // make sure we have a tmp folder for downloads!
  const tmpFolder = path.join(updaterOptions.appData, '/tmp');

  if (!fs.existsSync(tmpFolder)) {
    fs.mkdirSync(tmpFolder);
  } // First we prep which files need updates...


  const updateList = await Bluebird.mapSeries(assets, async function (asset) {
    updaterOptions.log.info(`:: Downloading/Checking ${asset}.md5`);
    const {
      data
    } = await downloadFile(`${asset}.md5`, progressCb, {
      errorCb
    });
    updaterOptions.log.info(`Remote MD5: ${String(data).trim()}`);
    const md5 = await getLocalHash(`${asset}.md5`); // @TODO if the below check fails, we should retry! But this should at least fix
    // the "phantom downloads"

    return {
      asset: asset,
      needUpdate: !!String(data).trim() && String(data).trim() !== String(md5).trim()
    };
  }).filter(a => a.needUpdate); // Next we download the zip files that we're looking for!

  updaterOptions.log.info(`:: Updating ${updateList.length} assets.`);

  if (updateList.length) {
    await Bluebird.mapSeries(updateList, async function (asset, index, length) {
      updaterOptions.log.info(`:: Updating ${asset.asset}.zip`);
      cb(`Downloading ${index + 1} of ${length}`); // eslint-disable-line standard/no-callback-literal
      // remove the old stale folder

      await rimraf.sync(path.join(updaterOptions.appData, `/assets/${asset.asset}/`));
      const {
        hash
      } = await downloadFile(`${asset.asset}.zip`, progressCb, {
        zipped: true
      });
      await fs.writeFileSync(path.join(updaterOptions.appData, `/assets/${asset.asset}.md5`), hash);
    });
  }

  updaterOptions.log.info(':: Removing TMP directory!');
  cb('Done! Cleaning up (this shouldn\'t take long)'); // eslint-disable-line standard/no-callback-literal

  await rimraf(path.join(updaterOptions.appData, `/tmp`), () => {
    updaterOptions.log.info('***ALL DONE***');
  });
};
