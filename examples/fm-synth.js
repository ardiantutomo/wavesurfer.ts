// A two-operator FM synth with a real-time waveform

import WaveSurfer from 'https://unpkg.com/wavesurfer.js@alpha'

const wavesurfer = WaveSurfer.create({
  container: '#waveform',
  waveColor: 'rgb(200, 0, 200)',
  cursorColor: 'transparent',
  barWidth: 2,
  interact: false,
})

const audioContext = new AudioContext()

// Create an analyser node
const analyser = audioContext.createAnalyser()
analyser.fftSize = 512 * 2
analyser.connect(audioContext.destination)
const dataArray = new Float32Array(analyser.frequencyBinCount)

// 6-voice polyphony
const voices = new Array(6).fill(null).map(() => {
  // Carrier oscillator
  const carrierOsc = audioContext.createOscillator()
  carrierOsc.type = 'sine'

  // Modulator oscillator
  const modulatorOsc = audioContext.createOscillator()
  modulatorOsc.type = 'sine'

  // Modulation depth
  const modulationGain = audioContext.createGain()

  // Connect the modulator to the carrier frequency
  modulatorOsc.connect(modulationGain)
  modulationGain.connect(carrierOsc.frequency)

  // Create an output gain
  const outputGain = audioContext.createGain()
  outputGain.gain.value = 0

  // Connect carrier oscillator to output
  carrierOsc.connect(outputGain)

  // Connect output to analyser
  outputGain.connect(analyser)

  // Start oscillators
  carrierOsc.start()
  modulatorOsc.start()

  return {
    carrierOsc,
    modulatorOsc,
    modulationGain,
    outputGain,
  }
})

let lastVoice = 0

function playNote(frequency, modulationFrequency, modulationDepth, duration) {
  if (voices[lastVoice].outputGain.gain.value > 0) {
    lastVoice = (lastVoice + 1) % voices.length
  }

  const voice = voices[lastVoice]

  const { carrierOsc, modulatorOsc, modulationGain, outputGain } = voice

  carrierOsc.frequency.value = frequency
  modulatorOsc.frequency.value = modulationFrequency
  modulationGain.gain.value = modulationDepth

  outputGain.gain.setValueAtTime(0.00001, audioContext.currentTime)
  outputGain.gain.exponentialRampToValueAtTime(0.8, audioContext.currentTime + duration / 1000)

  return voice
}

function releaseNote(voice, duration) {
  const { outputGain } = voice
  outputGain.gain.cancelScheduledValues(audioContext.currentTime)
  outputGain.gain.setValueAtTime(outputGain.gain.value * 1, audioContext.currentTime)
  outputGain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration / 1000)
  setTimeout(() => {
    outputGain.gain.value = 0
  }, duration)
}

function createPianoRoll() {
  const baseFrequency = 55
  const numRows = 4
  const numCols = 12

  const noteFrequency = (row, col) => {
    return baseFrequency * Math.pow(2, (col + row * numCols) / 12)
  }

  const pianoRoll = document.getElementById('pianoRoll')
  const qwerty = "`1234567890-=qwertyuiop[]asdfghjkl;'zxcvbnm,./üä"
  const capsQwerty = '~!@#$%^&*()_+QWERTYUIOP{}ASDFGHJKL:"ZXCVBNM<>?üä'

  const onKeyDown = (freq) => {
    const modulationIndex = parseFloat(document.getElementById('modulationIndex').value)
    const modulationDepth = parseFloat(document.getElementById('modulationDepth').value)
    const duration = parseFloat(document.getElementById('duration').value)
    return playNote(freq, freq * modulationIndex, modulationDepth, duration)
  }

  const onKeyUp = (voice) => {
    const duration = parseFloat(document.getElementById('duration').value)
    releaseNote(voice, duration)
  }

  const createButton = (row, col) => {
    const button = document.createElement('button')
    const key = qwerty[(row * numCols + col) % qwerty.length]
    const capsKey = capsQwerty[(row * numCols + col) % capsQwerty.length]
    const frequency = noteFrequency(row, col)
    let note = null

    button.textContent = key
    button.style.textTransform = 'inherit'
    pianoRoll.appendChild(button)

    // Mouse
    button.addEventListener('mousedown', (e) => {
      note = onKeyDown(frequency * (e.shiftKey ? numRows : 1))
    })
    button.addEventListener('mouseup', () => {
      if (note) {
        onKeyUp(note)
        note = null
      }
    })

    // Keyboard
    document.addEventListener('keydown', (e) => {
      if (e.key === key || e.key === capsKey) {
        button.className = 'active'
        if (!note) {
          note = onKeyDown(frequency * (e.shiftKey ? numRows : 1))
        }
      }
    })
    document.addEventListener('keyup', (e) => {
      if (e.key === key || e.key === capsKey) {
        button.className = ''
        if (note) {
          onKeyUp(note)
          note = null
        }
      }
    })
  }

  for (let row = 0; row < numRows; row++) {
    for (let col = 0; col < numCols; col++) {
      createButton(row, col)
    }
  }

  document.addEventListener('keydown', (e) => {
    if (e.shiftKey) {
      pianoRoll.style.textTransform = 'uppercase'
    }
  })
  document.addEventListener('keyup', (e) => {
    if (!e.shiftKey) {
      pianoRoll.style.textTransform = ''
    }
  })
}

function randomizeFmParams() {
  document.getElementById('modulationIndex').value = Math.random() * 10
  document.getElementById('modulationDepth').value = Math.random() * 200
  document.getElementById('duration').value = Math.random() * 300
}

// Draw the waveform
function drawWaveform() {
  // Get the waveform data from the analyser
  analyser.getFloatTimeDomainData(dataArray)
  const duration = document.getElementById('duration').valueAsNumber
  waveform && wavesurfer.load('', [dataArray], duration)
}

function animate() {
  requestAnimationFrame(animate)
  drawWaveform()
}

createPianoRoll()
animate()
randomizeFmParams()

/*
<html>
  <style>
    label {
      display: inline-block;
      width: 150px;
    }
    #pianoRoll {
      margin-top: 1em;
      width: 100%;
      display: grid;
      grid-template-columns: repeat(12, 6vw);
      grid-template-rows: repeat(5, 6vw);
      gap: 5px;
      user-select: none;
    }
    button {
      width: 100%;
      height: 100%;
      border: 1px solid #aaa;
      background-color: #fff;
      cursor: pointer;
    }
    button.active,
    button:active {
      background-color: #00f;
      color: #fff;
    }
  </style>
  <div>
    <label>Modulation Index:</label>
    <input type="range" min="0.5" max="10" value="2" step="0.5" id="modulationIndex">
  </div>
  <div>
    <label>Modulation Depth:</label>
    <input type="range" min="1" max="200" value="50" step="1" id="modulationDepth">
  </div>
  <div>
    <label>Attack/release duration:</label>
    <input type="range" min="10" max="300" value="10" step="10" id="duration">
  </div>
  <p>
    Hold Shift to play the notes one octave higher
  </p>
  <div id="pianoRoll"></div>
  <div id="waveform"></div>
</html>
*/
