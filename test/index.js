const { assetUpdater, init } = require('../index')

init({
  remote: 'https://s3-us-west-1.amazonaws.com/scl-cdn/doomtrooper/assets/',
  log: {
    info: (l) => console.log(l),
    error: (l) => console.log(l)
  },
  appData: process.cwd()
})

async function doit () {
  await assetUpdater(['cardbacks', 'parallax', 'avatars', 'ui'], (t) => {
    console.log('text ' + t)
  }, (p) => {
    console.log('progress ' + p)
  })
}

doit()
