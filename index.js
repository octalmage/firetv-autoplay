// Get playing state:
// adb shell dumpsys media_session
// State 3 is playing, state 2 is pasued.
// Reference: https://developer.android.com/reference/android/media/AudioTrack#PLAYSTATE_PLAYING

// Play a paused video:
// adb shell input keyevent 85

const adb = require('adbkit');
const client = adb.createClient();
const program = require('commander');
const pjson = require('./package.json');

let ip;

program
  .version(pjson.version)
  .arguments('[ip]')
  .action(function (passedIp) {
     ip = passedIp;
  })
  .parse(process.argv);

const sleep = (ms) => () => new Promise(resolve => setTimeout(resolve, 5000));

client.listDevices()
.then((devices) => {
  let device;
  if (devices.length === 1 && !ip) {
    device = devices[0];
  }

  return loop(Promise.resolve(), () => playIfNotPlaying(client, device).then(sleep(5000)));
})
.then(function() {
  console.log('Done.')
})
.catch(function(err) {
  console.error('Something went wrong:', err.stack)
})

function loop(promise, fn) {
  return promise.then(fn).then(function (value) {
    return loop(Promise.resolve(value), fn);
  });
}

const playIfNotPlaying = (client, device) => getPlayingState(client, device)
.then(({ state, device }) => {
  if (state !== 3) {
    console.log('Paused, pressing play.');
    return pressPlay(client, device)
    .then(() => state);
  }
  console.log('Playing');
  return state;
});

const getPlayingState = (client, device) => client.shell(device.id, 'dumpsys media_session')
// Use the readAll() utility to read all the content without
// having to deal with the events. `output` will be a Buffer
// containing all the output.
.then(adb.util.readAll)
.then(function(output) {
  const matches = /state=PlaybackState.*state=(\d)/gm.exec(output);
  return { device, state: parseInt(matches[1]) };
});

const pressPlay = (client, device) => client.shell(device.id, 'input keyevent 85')
.then(adb.util.readAll) // Wait for event to close.
.then(() => { device });
