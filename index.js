const unzip = require('node-unzip-2')
const path = require('path')
const fs = require('fs')
const md5file = require('md5-file')
const request = require('request')
const progress = require('request-progress')
const rimraf = require('rimraf')

const NO_OP = () => {}

const defaultOptions = {
  appData: null,
  log: {
    info: NO_OP,
    error: NO_OP
  },
  remote: null
}

let options = {
  ...defaultOptions
}

const downloadAndReadFile = (filename, md5Only, zipped, progressCb = () => null) => new Promise((resolve, reject) => {
  const remoteFileUri = `${options.remote}${filename}`
  const tmpFilePath = path.join(options.appData, `/tmp/${filename}`)
  options.log.info(`downloadAndSaveFile() -> ${filename}`)
  options.log.info(`Remote URL: ${remoteFileUri}`)

  progress(request(remoteFileUri))
    .on('progress', (state) => {
      progressCb(`Transferred ${Math.floor(state.percent * 100)}% (${Math.floor(state.size.transferred / 1000 / 1000)}Mb / ${Math.floor(state.size.total / 1000 / 1000)}Mb)`)
    })
    .on('error', (err) => {
      options.log.error('ERROR IN GET')
      reject(err)
    })
    .on('end', async () => {
      options.log.info(`${filename} Downloaded!`)
      const finish = async () => {
        const data = fs.readFileSync(tmpFilePath)
        if (tmpFilePath.split('.')[1] === 'md5') {
          options.log.info(`>>> File Data: ${data}`)
        }
        md5file(tmpFilePath, (err2, hash) => {
          if (err2) {
            throw new Error('ERROR CREATING MD5')
          }
          options.log.info(`MD5 of file: ${hash}`)
          resolve({ data, hash })
        })
      }
      if (zipped) {
        const unzipper = unzip
          .Extract({
            path: path.join(options.appData, '/assets')
          })
          .on('close', finish)
          .on('error', (err) => {
            reject(err)
          })
        fs.createReadStream(tmpFilePath).pipe(unzipper)
      } else {
        finish()
      }
    })
    .pipe(fs.createWriteStream(tmpFilePath))
})

const downloadAndCompareChecksums = (filename, progressCb = () => null) => new Promise(async (resolve, reject) => {
  let md5Remote = null
  let md5Local = null
  let { data } = await downloadAndReadFile(`${filename}`, false, false, progressCb) // check the md5
  md5Remote = data
  options.log.info(`Reading Local MD5 for ${filename}... ${path.join(options.appData, `/assets/${filename}`)}`)
  let md5 = null
  try {
    md5 = fs.readFileSync(path.join(options.appData, `/assets/${filename}`), 'utf8')
  } catch (e) {
    // empty on purpose
  }
  if (md5) {
    options.log.info(`Local MD5: ${md5}`)
    md5Local = md5
  } else {
    options.log.info(`No local ${filename} md5 found, so forcing download!`)
  }
  if (md5Local) {
    options.log.info(`Comparing local ${md5Local} versus remote: ${md5Remote} (${String(md5Local).trim() === String(md5Remote).trim()})`)
  }
  if (!md5Local || (String(md5Local).trim() !== String(md5Remote).trim())) {
    // no local or not the same, so we need to download!
    resolve(true)
  } else {
    options.log.info('md5 matches! No update needed!')
    resolve(false)
  }
})

exports.init = (config) => {
  options = {
    ...defaultOptions,
    ...config
  }
}

exports.assetUpdater = (assets, cb, progressCb = () => null) => new Promise(async (resolve, reject) => {
  // make sure we have a tmp folder for downloads!
  const tmpFolder = path.join(options.appData, '/tmp')
  if (!fs.existsSync(tmpFolder)) {
    fs.mkdirSync(tmpFolder)
  }

  let assetsNeedUpdating = []
  let promiseArray = assets.map(async (asset, i) => {
    options.log.info(`Checking ${i + 1} of ${assets.length}...`)
    const needsUpdate = await downloadAndCompareChecksums(`${asset}.md5`, progressCb)
    if (needsUpdate) {
      assetsNeedUpdating.push(asset)
    }
  })

  console.log(`----> ${JSON.stringify(promiseArray)}`)

  // so we don't remove directory if nothing is updating!
  if (!promiseArray.length) {
    options.log.info('NO UPDATES NEEDED')
    resolve()
  }

  Promise.all(promiseArray)
    .then(() => {
      options.log.info(`ASSETS NEED UPDATING: ${assetsNeedUpdating}`)
      let updated = 1
      if (assetsNeedUpdating.length) {
        cb(`Downloading 1 of ${assetsNeedUpdating.length}...`) // eslint-disable-line standard/no-callback-literal
      }
      let updateArray = assetsNeedUpdating.map(async (asset, i) => {
        options.log.info(`Preparing to download ${asset}.zip`)
        // remove the old directory
        rimraf.sync(path.join(options.appData, `/assets/${asset}/`))
        const { hash } = await downloadAndReadFile(`${asset}.zip`, true, true, progressCb)
        options.log.info(`FINISHED DOWNLOADING ${i + 1} of ${assetsNeedUpdating.length}`)
        updated += 1
        cb(`Downloading ${updated} of ${assetsNeedUpdating.length}...`) // eslint-disable-line standard/no-callback-literal
        // save new checksum
        fs.writeFileSync(path.join(options.appData, `/assets/${asset}.md5`), hash)
        options.log.info('Checksum saved!')
      })

      Promise.all(updateArray)
        .then(() => {
          options.log.info('ALL FILES FINISHED')
          resolve()
        })
    })
})
