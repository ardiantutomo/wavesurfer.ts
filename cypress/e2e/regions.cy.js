describe('WaveSurfer plugins', () => {
  beforeEach((done) => {
    cy.visit('cypress/e2e/index.html')

    cy.window().its('wavesurfer').should('exist')

    cy.window().then((win) => {
      const waitForReady = new Promise((resolve) => {
        win.wavesurfer.once('ready', () => resolve())
      })

      cy.wrap(waitForReady).then(done)
    })
  })

  it('should create and remove regions', () => {
    cy.window().then((win) => {
      const regions = win.wavesurfer.getActivePlugins()[0]

      expect(regions).to.be.an('object')

      // Add a region
      const color = 'rgba(100, 0, 0, 0.1)'
      const firstRegion = regions.add(1.5, 10.1, 'Hello', color)

      expect(firstRegion).to.be.an('object')
      expect(firstRegion.element).to.be.an('HTMLDivElement')
      expect(firstRegion.element.textContent).to.equal('Hello')
      expect(firstRegion.element.style.backgroundColor).to.equal(color)

      firstRegion.remove()
      expect(firstRegion.element).to.be.null

      // Create another region
      const secondColor = 'rgba(0, 0, 100, 0.1)'
      const secondRegion = regions.addRegion({
        start: 5.8,
        end: 12,
        content: 'Second',
        color: secondColor,
      })

      expect(secondRegion).to.be.an('object')
      expect(secondRegion.element).to.be.an('HTMLDivElement')
      expect(secondRegion.element.textContent).to.equal('Second')
      expect(secondRegion.element.style.backgroundColor).to.equal(secondColor)

      secondRegion.remove()
      expect(secondRegion.element).to.be.null
    })
  })

  it('should drag a region', () => {
    cy.window().then((win) => {
      const regions = win.wavesurfer.getActivePlugins()[0]
      const region = regions.add(3, 8, 'Region', 'rgba(0, 100, 0, 0.2)')

      expect(region.start).to.equal(3)

      // Drag the region
      const mouseDownEvent = new MouseEvent('mousedown', {
        clientX: 90,
        clientY: 1,
      })
      const mouseMoveEvent = new MouseEvent('mousemove', {
        clientX: 200,
        clientY: 10,
      })
      const mouseUpEvent = new MouseEvent('mouseup', {
        clientX: 200,
        clientY: 10,
      })
      region.element.dispatchEvent(mouseDownEvent)
      win.document.dispatchEvent(mouseMoveEvent)
      win.document.dispatchEvent(mouseUpEvent)

      expect(region.start).to.be.greaterThan(3)
    })
  })

  it('should set the color of a region', () => {
    cy.window().then((win) => {
      const regions = win.wavesurfer.getActivePlugins()[0]
      const region = regions.add(3, 8, 'Region', 'rgba(0, 100, 0, 0.2)')

      expect(region.color).to.equal('rgba(0, 100, 0, 0.2)')

      region.setOptions({ color: 'rgba(100, 0, 0, 0.1)' })

      expect(region.color).to.equal('rgba(100, 0, 0, 0.1)')

      region.remove()
    })
  })

  it('should set a region position', () => {
    cy.window().then((win) => {
      const regions = win.wavesurfer.getActivePlugins()[0]
      const region = regions.add(3, 8, 'Region', 'rgba(0, 100, 0, 0.2)')

      expect(region.start).to.equal(3)
      expect(region.end).to.equal(8)
      expect(region.resize).to.equal(true)

      region.setOptions({
        start: 5,
        end: 10,
        resize: false,
      })

      expect(region.start).to.equal(5)
      expect(region.end).to.equal(10)
      expect(region.resize).to.equal(false)
    })
  })

  it('should create markers', () => {
    cy.window().then((win) => {
      const regions = win.wavesurfer.getActivePlugins()[0]
      const region = regions.addRegion({ start: 3, content: 'Marker', color: 'rgba(0, 100, 100, 0.2)' })
      expect(region.start).to.equal(3)
      expect(region.end).to.equal(3)
      expect(region.element.style.backgroundColor).to.equal('')
    })
  })

  it('should allow drag selection', () => {
    cy.window().then((win) => {
      const regions = win.wavesurfer.getActivePlugins()[0]

      const disableDragSelection = regions.enableDragSelection({
        color: 'rgba(0, 100, 0, 0.2)',
        content: 'Drag',
      })

      expect(regions.getRegions().length).to.equal(0)

      regions.add(3, 8, 'Region', 'rgba(0, 100, 0, 0.2)')

      expect(regions.getRegions().length).to.equal(1)

      // Drag the region
      const mouseDownEvent = new MouseEvent('mousedown', {
        clientX: 40,
        clientY: 1,
      })
      const mouseMoveEvent = new MouseEvent('mousemove', {
        clientX: 100,
        clientY: 10,
      })
      const mouseUpEvent = new MouseEvent('mouseup', {
        clientX: 100,
        clientY: 10,
      })
      regions.wrapper.dispatchEvent(mouseDownEvent)
      win.document.dispatchEvent(mouseMoveEvent)
      win.document.dispatchEvent(mouseUpEvent)

      // It shouldn't trigger a click
      expect(win.wavesurfer.getCurrentTime()).to.equal(0)

      expect(regions.getRegions().length).to.equal(2)
      expect(regions.getRegions()[1].element.textContent).to.equal('Drag')
      regions.clearRegions()
      expect(regions.getRegions().length).to.equal(0)

      // Disable drag selection
      disableDragSelection()

      regions.wrapper.dispatchEvent(mouseDownEvent)
      win.document.dispatchEvent(mouseMoveEvent)
      win.document.dispatchEvent(mouseUpEvent)

      // It should not create any regions because drag selection is disabled
      expect(regions.getRegions().length).to.equal(0)
    })
  })

  it('should listen to clicks on a region', () => {
    cy.window().then((win) => {
      const regionsPlugin = win.wavesurfer.getActivePlugins()[0]

      const region = regionsPlugin.add(1, 5, 'Click me', 'rgba(0, 100, 0, 0.2)')

      expect(region.element.textContent).to.equal('Click me')

      region.on('click', (e) => {
        e.stopPropagation()
      })

      regionsPlugin.on('region-clicked', (reg, e) => {
        expect(e.stopPropagation instanceof Function).to.be.true
        expect(region).to.equal(reg)
        reg.play()
      })

      // Should not trigger an interaction on the wavesurfer
      win.wavesurfer.on('interaction', () => {
        expect(false).to.be.true
      })

      const clickEvent = new MouseEvent('click')

      region.element.dispatchEvent(clickEvent)

      expect(win.wavesurfer.isPlaying()).to.be.true
      expect(win.wavesurfer.getCurrentTime()).to.equal(region.start)

      win.wavesurfer.destroy()
    })
  })
})
