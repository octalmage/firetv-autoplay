# firetv-autoplay

> Tired of the "are you still watching" prompt?

Fire TV Autoplay connects to your Fire TV using the Android Debugging Bridge. So you'll need to have [adb](https://stackoverflow.com/a/32314718) installed. Then you have to get the IP of your Fire TV and connect using adb. Once you're connected, just run firetv-autoplay and it will press play when the prompt comes up.

## Usage

Install with npm:

```
npm install -g firetv-autoplay
```

Then run `firetv-autoplay`:

```bash
> firetv-autoplay
Playing
Paused, pressing play
Playing
```
