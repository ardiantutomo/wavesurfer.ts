// Envelope plugin
// Graphical fade-in and fade-out and volume control

/*
<html>
  <button style="margin: 0 2em 2em 0">Play</button>
  Volume: <label>0</label>
  <div id="container" style="border: 1px solid #ddd;"></div>
</html>
*/

import WaveSurfer from '../dist/wavesurfer.js'
import EnvelopePlugin from '../dist/plugins/envelope.js'

// Create an instance of WaveSurfer
const wavesurfer = WaveSurfer.create({
  container: '#container',
  waveColor: 'rgb(200, 0, 200)',
  progressColor: 'rgb(100, 0, 100)',
  url: '/examples/audio.wav',
})

// Initialize the Envelope plugin
const envelope = wavesurfer.registerPlugin(
  EnvelopePlugin.create({
    fadeInEnd: 5,
    fadeOutStart: 15,
    volume: 0.8,
    lineColor: 'rgba(255, 0, 0, 0.5)',
    lineWidth: 4,
    dragPointSize: 8,
    dragPointFill: 'rgba(0, 255, 255, 0.8)',
    dragPointStroke: 'rgba(0, 0, 0, 0.5)',
  }),
)

// Show the current volume
const volumeLabel = document.querySelector('label')
volumeLabel.textContent = envelope.getCurrentVolume()
envelope.on('volume-change', (volume) => {
  volumeLabel.textContent = volume.toFixed(2)
})
wavesurfer.on('timeupdate', () => {
  const volume = envelope.getCurrentVolume()
  volumeLabel.textContent = volume.toFixed(2)
})

// Play/pause button
const button = document.querySelector('button')
wavesurfer.once('canplay', () => {
  button.onclick = () => {
    wavesurfer.isPlaying() ? wavesurfer.pause() : wavesurfer.play()
  }
})
wavesurfer.on('play', () => {
  button.textContent = 'Pause'
})
wavesurfer.on('pause', () => {
  button.textContent = 'Play'
})

// Fade-in and fade-out change
envelope.on('fade-in-change', (time) => {
  console.log('Fade-in end time changed to', time)
})
envelope.on('fade-out-change', (time) => {
  console.log('Fade-out start time changed to', time)
})
