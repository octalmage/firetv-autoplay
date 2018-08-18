#!/usr/bin/env node
// Get playing state:
// adb shell dumpsys media_session
// State 3 is playing, state 2 is pasued.
// Reference: https://developer.android.com/reference/android/media/AudioTrack#PLAYSTATE_PLAYING

// Play a paused video:
// adb shell input keyevent 85

const adb = require('adbkit');
const client = adb.createClient();
const program = require('commander');
const inquirer = require('inquirer');
const pjson = require('./package.json');

let ip;

program
  .version(pjson.version)
  .arguments('[ip]')
  .action(function (passedIp) {
     ip = passedIp;
  })
  .parse(process.argv);

const sleep = (ms) => () => new Promise(resolve => setTimeout(resolve, ms));

client.listDevices()
.then((devices) => {
  let device;
  if (devices.length != 0 && ip) {
    const id = `${ip}:5555`;
    // Loop for IP in list.
    const filteredDevices = devices.filter(e => e.id === id);
    if (filteredDevices.length > 0) {
      return filteredDevices[0];
    } else {
      throw new Error('Device not found.');
    }
  // Only one device and no IP passed.
  } else if (devices.length === 1 && !ip) {
    return devices[0];
  } else if (devices.length > 0 && !ip) {
    return inquirer.prompt([{
      type: 'list',
      name: 'device',
      message: 'Which Fire TV would you like to pair with?',
      choices: devices.map(d => {
        return {
          name: d.id,
          value: d.id
        };
      })
    }])
    .then((answers) => {
      const id = answers['device'];
      return devices.filter(device => { return device.id == id; })[0];
    });
  } else {
    throw new Error('No devices found.');
  }
})
.then(device => loop(Promise.resolve(), () => playIfNotPlaying(client, device).then(sleep(5000))))
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
  if (state === 0) {
    console.log('Unknown state.');
    return state;
  } if (state !== 3) {
    console.log('Paused, pressing play.');
    return pressTrackball(client, device)
    .then(() => state);
  }
  console.log('Playing');
  return state;
});

const getPlayingState = (client, device) => client.shell(device.id, 'dumpsys audio')
// Use the readAll() utility to read all the content without
// having to deal with the events. `output` will be a Buffer
// containing all the output.
.then(adb.util.readAll)
.then(function(output) {
  const matches = /\(last is top of stack\):\s  source:(.*\n)\s Notify on duck: true/g.exec(output);
  let state = 1;
  if (matches) {
    state = 3
  }
  return { device, state };
});

const pressPlay = (client, device) => client.shell(device.id, 'input keyevent 85')
.then(adb.util.readAll) // Wait for event to close.
.then(() => { device });

const pressTrackball = (client, device) => client.shell(device.id, 'input press')
.then(adb.util.readAll) // Wait for event to close.
.then(() => { device });
