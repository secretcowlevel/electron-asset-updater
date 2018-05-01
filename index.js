const unzip = require('node-unzip-2');
const path = require('path');
const fs = require('fs');
const md5file = require('md5-file');
const request = require('request');
const rimraf = require('rimraf');

// cache appData!
let options = {
    appData: null,
    log: () => {},
    remote: null
};


const downloadAndReadFile = (filename, md5Only, zipped) => new Promise(async (resolve, reject) => {
    options.log.info(`downloadAndSaveFile() -> ${filename}`);
    const remoteFileUri = `${options.remote}${filename}`;
    options.log.info(`Remote URL: ${remoteFileUri}`);
    const tmpFilePath = path.join(options.appData, `/tmp/${filename}`);
    // options.log.info(`Downloading ${filename}...`);

    request(remoteFileUri)
    .on('error', (err) => {
        options.log.error('ERROR IN GOT');
        reject(err);
    })
    // @TODO - this is new API stuff that lets us get progress, not done yet
    // .on('response', () => {
    //     options.log.info('RESPONSE FIRED');
    // })
    .on('end', () => {
        options.log.info(`${filename} Downloaded!`);
        if (zipped) {
            fs.createReadStream(tmpFilePath).pipe(unzip.Extract({path: path.join(options.appData, '/assets')}));
        }
        fs.readFile(tmpFilePath, (err, data) => {
            if (tmpFilePath.split('.')[1] === 'md5') {
                options.log.info(`>>> File Data: ${data}`);
            }
            md5file(tmpFilePath, (err2, hash) => {
                if (err2) {
                    reject('ERROR CREATING MD5');
                }
                options.log.info(`MD5 of file: ${hash}`);
                // fs.unlink(tmpFilePath, () => {
                //     options.log.info(`Deleted ${filename} with hash ${hash}!`);
                resolve({data, hash});
                // });
            });
        });
    })
    .pipe(fs.createWriteStream(tmpFilePath));

    // SYNC VERSION?
    // let data = await got(remoteFileUri);
    // options.log.info(`FINISHED DOWNLOAD ${data}`);
    // resolve(data);
    // }
});

const downloadAndCompareChecksums = filename => new Promise(async (resolve) => {
    let md5Remote = null;
    let md5Local = null;
    let {data} = await downloadAndReadFile(`${filename}`); // check the md5
    // .then(({data}) => {
    md5Remote = data;
    options.log.info(`Reading Local MD5 for ${filename}... ${path.join(options.appData, `/assets/${filename}`)}`);
    let md5 = null;
    try {
        md5 = fs.readFileSync(path.join(options.appData, `/assets/${filename}`), 'utf8');
    } catch (e) {
        // empty on purpose
    }
    if (md5) {
        options.log.info(`Local MD5: ${md5}`);
        md5Local = md5;
    } else {
        options.log.info(`No local ${filename} md5 found, so forcing download!`);
    }
    if (md5Local) {
        options.log.info(`Comparing local ${md5Local} versus remote: ${md5Remote} (${String(md5Local).trim() === String(md5Remote).trim()})`);
    }
    if (!md5Local || (String(md5Local).trim() !== String(md5Remote).trim())) {
        // no local or not the same, so we need to download!
        resolve(true);
    } else {
        options.log.info('md5 matches! No update needed!');
        resolve(false);
    }
    // });
    // })
    // .catch((/* err */) => {
    //     options.log.error('Error in downloadAndCompareChecksums()');
    //     reject();
    // });
});

exports.init = (config) => {
    options = Object.assign({}, options, config);
};

exports.assetUpdater = (assets, cb) => new Promise(async (resolve) => {
    // make sure we have a tmp folder for downloads!
    const tmpFolder = path.join(options.appData, '/tmp');
    if (!fs.existsSync(tmpFolder)) {
        fs.mkdirSync(tmpFolder);
    }

    let assetsNeedUpdating = [];
    let promiseArray = assets.map((asset, i) => {
        options.log.info(`Checking ${i + 1} of ${assets.length}...`);
        // cb(`Checking ${i + 1} of ${assets.length}...`);
        return downloadAndCompareChecksums(`${asset}.md5`)
        .then((needsUpdate) => {
            if (needsUpdate) {
                assetsNeedUpdating.push(asset);
            }
        });
    });

    // so we don't remove directory if nothing is updating!
    if (!promiseArray.length) {
        options.log.info('NO UPDATES NEEDED');
        resolve();
    }
    Promise.all(promiseArray)
    .then(() => {
        options.log.info(`ASSETS NEED UPDATING: ${assetsNeedUpdating}`);
        let updated = 1;
        if (assetsNeedUpdating.length) {
            cb(`Downloading 1 of ${assetsNeedUpdating.length}...`);
        }
        let updateArray = assetsNeedUpdating.map((asset, i) => {
            options.log.info(`Preparing to download ${asset}.zip`);
            // remove the old directory
            rimraf.sync(path.join(options.appData, `/assets/${asset}/`));
            return downloadAndReadFile(`${asset}.zip`, true, true)
            .then(({hash}) => {
                options.log.info(`FINISHED DOWNLOADING ${i + 1} of ${assetsNeedUpdating.length}`);
                updated += 1;
                cb(`Downloading ${updated} of ${assetsNeedUpdating.length}...`);
                // save new checksum
                fs.writeFileSync(path.join(options.appData, `/assets/${asset}.md5`), hash);
                options.log.info('Checksum saved!');
            })
            .catch((e) => {
                throw new Error(e);
            });
        });

        Promise.all(updateArray)
        .then(() => {
            options.log.info('ALL FILES FINISHED');
            resolve();
        });
    });
});
