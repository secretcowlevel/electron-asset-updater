const path = require('path')
const fs = require('fs')
const md5file = require('md5-file')
const request = require('request')
const unzip = require('node-unzip-2')
const progress = require('request-progress')

const NO_OP = () => {}

const defaultOptions = {
  appData: null,
  log: {
    info: NO_OP,
    error: NO_OP
  },
  remote: null
}

let updaterOptions = {
  ...defaultOptions
}

// helper function to download a file
async function downloadFile (filename, progressCb, options = {}) {
  return new Promise(async (resolve, reject) => {
    const remoteFileUri = `${updaterOptions.remote}${filename}`
    const tmpFilePath = path.join(updaterOptions.appData, `/tmp/${filename}`)
    updaterOptions.log.info(`downloadAndSaveFile() -> ${filename}`)
    updaterOptions.log.info(`Remote URL: ${remoteFileUri}`)

    await progress(request(remoteFileUri))
      .on('progress', (state) => {
        progressCb(`Transferred ${Math.floor(state.percent * 100)}% (${Math.floor(state.size.transferred / 1000 / 1000)}Mb / ${Math.floor(state.size.total / 1000 / 1000)}Mb)`)
      })
      .on('error', (err) => {
        updaterOptions.log.error('ERROR IN GET')
        reject(err)
      })
      .on('end', async () => {
        updaterOptions.log.info(`${filename} Downloaded!`)
        const finish = async () => {
          const data = fs.readFileSync(tmpFilePath)
          if (tmpFilePath.split('.')[1] === 'md5') {
            updaterOptions.log.info(`>>> File Data: ${data}`)
          }
          md5file(tmpFilePath, (err2, hash) => {
            if (err2) {
              throw new Error('ERROR CREATING MD5')
            }
            updaterOptions.log.info(`MD5 of file: ${hash}`)
            resolve({ data, hash })
          })
        }
        if (options.zipped) {
          const unzipper = unzip
            .Extract({
              path: path.join(updaterOptions.appData, '/assets')
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
  })
}

// the init function, called before we call the assetUpdater
exports.init = (config) => {
  updaterOptions = {
    ...defaultOptions,
    ...config
  }
}
// the main entry point to start the updater
exports.assetUpdater = function (assets, cb, progressCb) {
  updaterOptions.log.info('WHAAAAAAAAAAAAAAAT')
  // make sure we have a tmp folder for downloads!
  const tmpFolder = path.join(updaterOptions.appData, '/tmp')
  if (!fs.existsSync(tmpFolder)) {
    fs.mkdirSync(tmpFolder)
  }

  // keep track of all the assets we need to update
  let assetsNeedUpdating = []

  assets.forEach(async (asset, i) => {
    updaterOptions.log.info(`Downloading checksum ${i + 1} of ${assets.length}...`)
    const needsUpdate = await downloadFile(`${asset}.md5`, progressCb)
    if (needsUpdate) {
      assetsNeedUpdating.push(asset)
    }
  })

  console.log(`----> ${JSON.stringify(assetsNeedUpdating)}`)
}
