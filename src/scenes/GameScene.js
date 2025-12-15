import Phaser from 'phaser';

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
    this.player = null;
    this.ground = null;
    this.obstacles = null;
    this.cursors = null;
    this.jumpKey = null;
    this.levelWidth = 20000;
    this.gameOver = false;
    this.playerState = 'idle';
    this.lastGroundedAt = 0;
    this.jumpBufferedAt = 0;
    this.pointerJumpQueued = false;
    this.coyoteTime = 120; // ms of leeway after leaving the ground
    this.jumpBuffer = 120; // ms to buffer jump input before landing
    this.baseJumpVelocity = -660;
    this.jumpVelocity = this.baseJumpVelocity;
    this.jumpCutMultiplier = 0.35; // stronger cut for tighter short hops
    this.fallGravityBoost = 420; // extra gravity applied when falling for snappier landings
    this.baseSpeed = 260; // starting forward speed
    this.speedRamp = 0.02; // base speed gain factor
    this.maxSpeed = 520; // capped to keep difficulty fair
    this.playerSpeed = this.baseSpeed;
    this.runStartTime = 0;
    this.nextSpawnAt = 0;
    this.spawnBaseInterval = 1400; // ms at start (easier)
    this.spawnMinInterval = 700; // ms cap to avoid unfair spam
    this.score = 0;
    this.scoreText = null;
    this.scoreSpeedFactor = 0.25; // additional speed per 100 points
    this.gameOverText = null;
    this.gameOverPanel = null;
    this.isEnteringInitials = false;
    this.initials = ['A', 'A', 'A'];
    this.initialsIndex = 0;
    this.initialsText = null;
    this.initialsOverlay = null;
    this.initialsKeyHandler = null;
    this.initialsPointerHandler = null;
    this.powerIcon = null;
    this.powerMessage = null;
    this.powerMessageTween = null;
    this.powerRing = null;
    this.activePowerKey = null;
    this.activePowerEndsAt = 0;
    this.activePowerDuration = 0;
    this.powerups = null;
    this.powerSpawnAt = 0;
    this.powerSpawnMin = 5000;
    this.powerSpawnMax = 9000;
    this.isInvincible = false;
    this.isJumpBoosted = false;
    this.powerTimer = null;
    this.isSpinning = false;
    this.spinEndAt = 0;
    this.spinCooldownAt = 0;
    this.jumpSpinTween = null;
    this.playerScale = 0.16  ; // Base scale for the bus sprite

    // Biome system
    this.currentBiome = 'desert';
    this.biomes = ['desert', 'snow', 'pradera', 'volcano'];
    this.biomeChangeScore = 700;
    this.backgroundLayers = { sky: null, farHills: null, midHills: null };
    this.biomeText = null;
    
    // New boost items
    this.isSpeedBoosted = false;
    this.hasDoublePoints = false;
    this.hasMagnet = false;
    this.magnetRadius = 150;
    
    // Improved terrain
    this.platforms = null;
    this.nextPlatformAt = 0;
    this.decorations = null;
  }

  preload() {
    // Load biome background images
    this.load.image('bg-desierto', '/desierto.png');
    this.load.image('bg-nieve', '/nieve.png');
    this.load.image('bg-pradera', '/pradera.png');
    this.load.image('bg-volcan', '/volcan.png');

    // Load bus sprite
    this.load.image('bus-sprite', '/bus.png');

    // Load biome-specific obstacle sprites
    this.load.image('obstacle-desert', '/cactus-1.png');
    this.load.image('obstacle-snow', '/glacial-1.png');
    this.load.image('obstacle-pradera', '/arbusto-1.png');
    this.load.image('obstacle-volcano', '/volcanopilar-1.png');

    // Load biome-specific tile sprites
    this.load.image('tile-desert', '/sand-tile.PNG');
    this.load.image('tile-snow', '/snow-tile.PNG');
    this.load.image('tile-pradera', '/grass-tile.PNG');
    this.load.image('tile-volcano', '/volcano-tile.PNG');

    // Build simple textures at runtime for power-ups
    this.createPlaceholderTextures();
  }

  create() {
    this.resetState();
    this.createBackground();
    this.createWorld();
    this.createPlayer();
    this.createObstacles();
    this.createPowerups();
    this.createPlatforms();
    this.createDecorations();
    this.createCamera();
    this.createControls();
    this.addHUD();
  }

  resetState() {
    // Reset per-run values so scene.restart() fully rebuilds state without a page refresh
    this.gameOver = false;
    this.score = 0;
    this.playerState = 'idle';
    this.playerSpeed = this.baseSpeed;
    this.runStartTime = this.time.now;
    this.nextSpawnAt = this.time.now + 800;
    this.lastGroundedAt = 0;
    this.jumpBufferedAt = 0;
    this.pointerJumpQueued = false;
    this.scoreText = null;
    this.gameOverText = null;
    this.isEnteringInitials = false;
    this.initials = ['A', 'A', 'A'];
    this.initialsIndex = 0;
    this.initialsText = null;
    this.initialsOverlay = null;
    if (this.gameOverPanel) {
      this.gameOverPanel.destroy(true);
      this.gameOverPanel = null;
    }
    this.teardownInitialsInput();
    this.powerSpawnAt = this.time.now + Phaser.Math.Between(this.powerSpawnMin, this.powerSpawnMax);
    this.isInvincible = false;
    this.isJumpBoosted = false;
    this.jumpVelocity = this.baseJumpVelocity;
    this.powerIcon = null;
    this.powerMessage = null;
    this.powerRing = null;
    this.activePowerKey = null;
    this.activePowerEndsAt = 0;
    this.activePowerDuration = 0;
    if (this.powerMessageTween) {
      this.powerMessageTween.stop();
      this.powerMessageTween = null;
    }
    if (this.powerTimer) {
      this.powerTimer.remove(false);
      this.powerTimer = null;
    }
    this.isSpinning = false;
    this.spinEndAt = 0;
    this.spinCooldownAt = 0;
    
    // Reset biome system
    this.currentBiome = 'desert';
    this.biomeText = null;
    
    // Reset new boost items
    this.isSpeedBoosted = false;
    this.hasDoublePoints = false;
    this.hasMagnet = false;
    
    // Reset terrain
    this.nextPlatformAt = this.time.now + 3000;
  }

  update() {
    if (this.gameOver) {
      if (this.isEnteringInitials) {
        return;
      }
      // Restart loop: wait for SPACE, then use scene.restart() to reset the run without reloading
      if (Phaser.Input.Keyboard.JustDown(this.jumpKey)) {
        this.restartFromUI();
      }
      return;
    }
    // Core game loop: collect input, apply physics impulses, spawn/cleanup obstacles, then update visuals
    this.updateScore();
    this.updateBiome();
    this.updateRunnerSpeed();
    this.handlePlayerInput();
    this.spawnObstaclesIfNeeded();
    this.spawnPowerupsIfNeeded();
    this.spawnPlatformsIfNeeded();
    this.cleanupPowerups();
    this.cleanupObstacles();
    this.cleanupPlatforms();
    this.updateSpin();
    this.updatePlayerState();
    this.updatePowerRing();
    this.updateMagnet();
    this.updateBackgroundParallax();
  }

  createBackground() {
    // Create background using biome images with parallax effect
    const bgKey = this.getBiomeImageKey(this.currentBiome);

    // Create a tileSprite that covers the screen (images are 2752x1536, game is 960x540)
    this.backgroundLayers.sky = this.add.tileSprite(0, 0, this.scale.width, this.scale.height, bgKey)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(-3);

    // Scale down the background tiles to fit properly (2752x1536 -> 960x540)
    this.backgroundLayers.sky.setTileScale(0.35, 0.35);
  }

  createPlaceholderTextures() {
    // Note: Bus sprite, obstacle sprites, and tile sprites are loaded from /public in preload()

    // Power-ups
    const invGfx = this.add.graphics();
    invGfx.fillStyle(0xfff066, 1);
    invGfx.fillCircle(16, 16, 16);
    invGfx.lineStyle(3, 0xffb347);
    invGfx.strokeCircle(16, 16, 16);
    invGfx.generateTexture('power-invincible', 32, 32);
    invGfx.destroy();

    const boostGfx = this.add.graphics();
    boostGfx.fillStyle(0x7fffd4, 1);
    boostGfx.fillRoundedRect(0, 0, 32, 32, 8);
    boostGfx.lineStyle(3, 0x1fa27a);
    boostGfx.strokeRoundedRect(0, 0, 32, 32, 8);
    boostGfx.generateTexture('power-jump', 32, 32);
    boostGfx.destroy();
    
    // New power-ups
    const speedGfx = this.add.graphics();
    speedGfx.fillStyle(0xff4757, 1);
    speedGfx.fillCircle(16, 16, 16);
    speedGfx.lineStyle(3, 0xc23616);
    speedGfx.strokeCircle(16, 16, 16);
    speedGfx.generateTexture('power-speed', 32, 32);
    speedGfx.destroy();
    
    const doubleGfx = this.add.graphics();
    doubleGfx.fillStyle(0xffa502, 1);
    // Create a star shape manually
    const starPoints = this.createStarPoints(16, 16, 5, 14, 7);
    doubleGfx.fillPoints(starPoints, true);
    doubleGfx.lineStyle(3, 0xcc8000);
    doubleGfx.strokeCircle(16, 16, 14);
    doubleGfx.generateTexture('power-double', 32, 32);
    doubleGfx.destroy();
    
    const magnetGfx = this.add.graphics();
    magnetGfx.fillStyle(0xe056fd, 1);
    magnetGfx.fillRoundedRect(6, 0, 20, 32, 6);
    magnetGfx.fillStyle(0xb03fc5, 1);
    magnetGfx.fillRect(10, 12, 12, 8);
    magnetGfx.generateTexture('power-magnet', 32, 32);
    magnetGfx.destroy();

    // HUD icons (lightweight placeholders)
    const hudJump = this.add.graphics();
    hudJump.fillStyle(0xffe066, 1);
    hudJump.fillCircle(12, 12, 12);
    hudJump.lineStyle(3, 0xffc247);
    hudJump.strokeCircle(12, 12, 12);
    hudJump.generateTexture('hud-power-jump', 24, 24);
    hudJump.destroy();

    const hudInv = this.add.graphics();
    hudInv.fillStyle(0xfff7a7, 1);
    hudInv.fillRoundedRect(0, 0, 24, 24, 8);
    hudInv.lineStyle(3, 0xf0c94f);
    hudInv.strokeRoundedRect(0, 0, 24, 24, 8);
    hudInv.generateTexture('hud-power-inv', 24, 24);
    hudInv.destroy();
    
    const hudSpeed = this.add.graphics();
    hudSpeed.fillStyle(0xff4757, 1);
    hudSpeed.fillCircle(12, 12, 12);
    hudSpeed.lineStyle(3, 0xc23616);
    hudSpeed.strokeCircle(12, 12, 12);
    hudSpeed.generateTexture('hud-power-speed', 24, 24);
    hudSpeed.destroy();
    
    const hudDouble = this.add.graphics();
    hudDouble.fillStyle(0xffa502, 1);
    // Create a star shape manually
    const hudStarPoints = this.createStarPoints(12, 12, 5, 10, 5);
    hudDouble.fillPoints(hudStarPoints, true);
    hudDouble.generateTexture('hud-power-double', 24, 24);
    hudDouble.destroy();
    
    const hudMagnet = this.add.graphics();
    hudMagnet.fillStyle(0xe056fd, 1);
    hudMagnet.fillRoundedRect(6, 0, 12, 24, 4);
    hudMagnet.generateTexture('hud-power-magnet', 24, 24);
    hudMagnet.destroy();
  }

  createStarPoints(cx, cy, spikes, outerRadius, innerRadius) {
    const points = [];
    const step = Math.PI / spikes;

    for (let i = 0; i < spikes * 2; i++) {
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const angle = i * step - Math.PI / 2;
      points.push({
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius
      });
    }

    return points;
  }

  createWorld() {
    this.ground = this.physics.add.staticGroup();
    const groundY = this.scale.height - 40;
    const tileKey = this.getBiomeTileKey(this.currentBiome);

    // Tiles are ~1000x1000, scale to 128x128
    const tileScale = 0.128;

    for (let x = 0; x < this.levelWidth; x += 128) {
      const tile = this.ground.create(x + 64, groundY, tileKey);
      tile.setOrigin(0.5, 0.5);
      tile.setScale(tileScale);
      tile.refreshBody();
    }

    // Set world bounds so the camera and physics know the level size
    this.physics.world.setBounds(0, 0, this.levelWidth, this.scale.height);
  }

  createPlayer() {
    this.player = this.physics.add.sprite(120, this.scale.height - 140, 'bus-sprite');

    // Scale down the bus sprite significantly (bus.png is 500x245, we want small like original ~54x38)
    this.player.setScale(this.playerScale);

    this.player.setCollideWorldBounds(true);

    // Set hitbox relative to original image size (then scaled down)
    // Original image: 500x245, we want the collision box centered on the bus body
    this.player.setSize(400, 180);  // Smaller hitbox within the sprite
    this.player.setOffset(50, 50);   // Offset to center it on the bus body

    this.player.setDragX(1400);
    this.player.setMaxVelocity(360, 1000);
    this.player.body.setAllowRotation(false);

    this.physics.add.collider(this.player, this.ground);
  }
  
  createPlatforms() {
    this.platforms = this.physics.add.staticGroup();
    this.physics.add.collider(this.player, this.platforms);
  }
  
  createDecorations() {
    this.decorations = this.add.group();
  }

  createObstacles() {
    this.obstacles = this.physics.add.staticGroup();
    // Collide and restart when hitting an obstacle
    this.physics.add.collider(this.player, this.obstacles, (player, obstacle) => this.handleObstacleHit(player, obstacle));
  }

  createPowerups() {
    // Overlap (not collide) so collection doesn't resolve physics or pause movement
    this.powerups = this.physics.add.group({ allowGravity: false, immovable: true });
    this.physics.add.overlap(this.player, this.powerups, (player, power) => {
      // Defensive: power-ups should never trigger game over or pauses
      if (!power || this.gameOver) return;
      const key = power.texture.key;
      power.destroy();
      // Defer activation one tick so we exit the overlap resolution safely (prevents freezes)
      this.time.delayedCall(0, () => this.handlePowerupPickup(key));
    });
  }

  createCamera() {
    const camera = this.cameras.main;
    camera.setBounds(0, 0, this.levelWidth, this.scale.height);
    camera.startFollow(this.player, true, 0.15, 0.0); // Follow horizontally; keep y steady for readability
    camera.setDeadzone(this.scale.width * 0.25, this.scale.height);
  }

  createControls() {
    this.cursors = this.input.keyboard.createCursorKeys();
    this.jumpKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    // Touch/tap support: enqueue a jump attempt on pointer down to reuse the same buffered jump logic
    this.input.on('pointerdown', () => {
      if (!this.gameOver) {
        this.pointerJumpQueued = true;
      }
    });
  }

  addHUD() {
    this.add.text(16, 16, 'FRIENDS BUSSI', { fontSize: '20px', color: '#0b4b5a', fontStyle: 'bold' }).setScrollFactor(0);
    this.add.text(16, 42, 'Auto-run right. Jump to avoid obstacles.', { fontSize: '14px', color: '#0b4b5a' }).setScrollFactor(0);
    this.scoreText = this.add.text(this.scale.width - 16, 16, 'Score: 0', { fontSize: '20px', color: '#0b4b5a', fontStyle: 'bold' })
      .setScrollFactor(0)
      .setOrigin(1, 0);

    // Power-up HUD (fixed to screen)
    this.powerIcon = this.add.image(this.scale.width - 16, 48, 'hud-power-jump')
      .setScrollFactor(0)
      .setOrigin(1, 0)
      .setVisible(false)
      .setDepth(5);
    this.powerRing = this.add.graphics().setScrollFactor(0).setDepth(4);

    this.powerMessage = this.add.text(this.scale.width / 2, 18, '', {
      fontSize: '18px',
      color: '#0b4b5a',
      fontStyle: 'bold',
      align: 'center'
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(6).setAlpha(0);
  }

  updateScore() {
    if (!this.player) return;
    const multiplier = this.hasDoublePoints ? 2 : 1;
    const distanceScore = Math.floor(this.player.x * 0.1 * multiplier);
    if (distanceScore !== this.score) {
      this.score = distanceScore;
      if (this.scoreText) {
        this.scoreText.setText(`Score: ${this.score}`);
      }
    }
  }

  updateRunnerSpeed() {
    // Difficulty factor grows over time but eases out and clamps to keep runs fair
    const elapsed = this.time.now - this.runStartTime;
    const normalized = Phaser.Math.Clamp(elapsed / 30000, 0, 1); // 0..1 over 30s
    const difficultyEase = Phaser.Math.Easing.Quadratic.Out(normalized);

    // Score still nudges speed but both contributions are capped by maxSpeed
    const scoreBoost = (this.score / 100) * this.scoreSpeedFactor;
    const rampFromTime = difficultyEase * 180; // add up to ~180 units from time ramp
    let target = this.baseSpeed + rampFromTime + scoreBoost;
    
    // Apply speed boost multiplier
    if (this.isSpeedBoosted) {
      target *= 1.4;
    }
    
    this.playerSpeed = Phaser.Math.Clamp(target, this.baseSpeed, this.maxSpeed * (this.isSpeedBoosted ? 1.4 : 1));
  }

  handlePlayerInput() {
    if (!this.player || this.gameOver) return;

    const now = this.time.now;
    const onGround = this.player.body.blocked.down;
    if (onGround) {
      this.lastGroundedAt = now;
    }

    // Auto-run forward; no manual horizontal input in runner mode
    this.player.setVelocityX(this.playerSpeed);
    this.player.setFlipX(false);

    // Buffer jump input and allow a tiny coyote window so jumps feel responsive
    const jumpPressed =
      Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
      Phaser.Input.Keyboard.JustDown(this.jumpKey) ||
      this.consumePointerJump();
    if (jumpPressed) {
      this.jumpBufferedAt = now;
    }

    const canUseBufferedJump = this.jumpBufferedAt && (onGround || now - this.lastGroundedAt <= this.coyoteTime);
    const bufferedStillValid = this.jumpBufferedAt && now - this.jumpBufferedAt <= this.jumpBuffer;

    if (bufferedStillValid && canUseBufferedJump) {
      this.player.setVelocityY(this.jumpVelocity);
      this.jumpBufferedAt = 0;
      this.playJumpSpin();
      this.playJumpSound();
    }

    // Variable jump height: releasing jump early shortens airtime
    const jumpReleased = Phaser.Input.Keyboard.JustUp(this.cursors.up) || Phaser.Input.Keyboard.JustUp(this.jumpKey);
    if (jumpReleased && this.player.body.velocity.y < 0) {
      this.player.setVelocityY(this.player.body.velocity.y * this.jumpCutMultiplier);
    }

    // Spin/slide on ground with cooldown
    // Mid-air fast fall spin (down only works in-air)
    const downPressed = Phaser.Input.Keyboard.JustDown(this.cursors.down);
    if (downPressed && !onGround && !this.isSpinning && now >= this.spinCooldownAt) {
      this.startSpin(now);
      this.player.setVelocityY(Math.max(this.player.body.velocity.y, 600)); // nudge downward speed
    }

    // Stronger gravity when falling for snappier landings
    const falling = this.player.body.velocity.y > 0 && !onGround;
    this.player.body.setGravityY(falling ? this.fallGravityBoost : 0);
  }

  spawnObstaclesIfNeeded() {
    if (this.gameOver || !this.player) return;
    const now = this.time.now;
    if (now < this.nextSpawnAt) return;

    // Frequency ramps up slowly with an eased, clamped difficulty factor to stay predictable
    const normalized = Phaser.Math.Clamp((now - this.runStartTime) / 30000, 0, 1); // 30s to full difficulty
    const difficultyEase = Phaser.Math.Easing.Cubic.Out(normalized);
    const interval = Phaser.Math.Linear(this.spawnBaseInterval, this.spawnMinInterval, difficultyEase);
    this.spawnRandomObstacle();
    this.nextSpawnAt = now + interval;
  }

  spawnPowerupsIfNeeded() {
    if (this.gameOver || !this.player) return;
    const now = this.time.now;
    if (now < this.powerSpawnAt) return;

    this.spawnRandomPowerup();
    this.powerSpawnAt = now + Phaser.Math.Between(this.powerSpawnMin, this.powerSpawnMax);
  }

  spawnRandomObstacle() {
    const camera = this.cameras.main;
    const spawnX = camera.scrollX + this.scale.width + Phaser.Math.Between(80, 220);

    // Ground tiles are at Y = scale.height - 40 with origin (0.5, 0.5) and size 128x128
    // So the top of the tile is at (scale.height - 40 - 64) = scale.height - 104
    const groundY = this.scale.height - 40;
    const tileHeight = 128;
    const obstacleBaseY = groundY - (tileHeight / 2);

    // Get obstacle sprite based on current biome
    const obstacleKey = this.getBiomeObstacleKey(this.currentBiome);
    const obstacle = this.obstacles.create(spawnX, obstacleBaseY, obstacleKey);
    obstacle.setOrigin(0.5, 1);

    // Scale down the obstacle sprites (they're ~450x550, we want ~46 height)
    obstacle.setScale(0.08);

    obstacle.refreshBody();
  }

  cleanupObstacles() {
    const cameraLeft = this.cameras.main.scrollX;
    this.obstacles.children.iterate((child) => {
      if (!child || !child.active) return;
      if (child.x < cameraLeft - 200) {
        child.destroy();
      }
    });
  }

  spawnRandomPowerup() {
    const camera = this.cameras.main;
    const spawnX = camera.scrollX + this.scale.width + Phaser.Math.Between(200, 420);
    const spawnY = this.scale.height - Phaser.Math.Between(120, 180); // hover above ground
    
    const powerTypes = ['power-invincible', 'power-jump', 'power-speed', 'power-double', 'power-magnet'];
    const key = Phaser.Utils.Array.GetRandom(powerTypes);
    
    const power = this.powerups.create(spawnX, spawnY, key);
    power.setOrigin(0.5, 0.5);
    power.setImmovable(true);
    power.body.allowGravity = false;
    
    // Add floating animation
    this.tweens.add({
      targets: power,
      y: spawnY + 10,
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.InOut'
    });
  }

  cleanupPowerups() {
    const cameraLeft = this.cameras.main.scrollX;
    this.powerups.children.iterate((child) => {
      if (!child || !child.active) return;
      if (child.x < cameraLeft - 200) {
        child.destroy();
      }
    });
  }

  consumePointerJump() {
    if (this.pointerJumpQueued) {
      this.pointerJumpQueued = false;
      return true;
    }
    return false;
  }

  updatePlayerState() {
    if (!this.player) return;

    const onGround = this.player.body.blocked.down;
    const moving = Math.abs(this.player.body.velocity.x) > 20;
    let newState = 'idle';

    if (!onGround) {
      newState = 'jump';
    } else if (moving) {
      newState = 'move';
    }

    if (newState !== this.playerState) {
      this.applyStateVisual(newState);
      this.playerState = newState;
    }

    // Reset angle when landing if any spin tween was active
    if (onGround) {
      if (this.jumpSpinTween) {
        this.jumpSpinTween.stop();
        this.jumpSpinTween = null;
      }
      if (!this.isSpinning && this.player.angle !== 0) {
        this.player.setAngle(0);
      }
    }

    this.applyRunEffects(onGround, moving);
  }

  applyStateVisual(state) {
    this.player.setTint(this.getActiveTint());
    this.player.setAlpha(1);
  }

  applyRunEffects(onGround, moving) {
    // Lightweight "animation" using scale/rotation; no external assets or spritesheets
    if (!this.player) return;
    if (this.isSpinning) return;
    const now = this.time.now;
    if (onGround && moving) {
      const bobScaleY = 1 + Math.sin(now * 0.02) * 0.04; // subtle vertical bob
      const leanBase = 5;
      const leanOsc = Math.sin(now * 0.08) * 2; // tiny oscillation to imply wheel spin
      // Use playerScale as base instead of 1
      this.player.setScale(this.playerScale, this.playerScale * bobScaleY);
      this.player.setAngle(leanBase + leanOsc);
    } else {
      // Reset visuals when idle or in-air (no double-tilt while jumping)
      this.player.setScale(this.playerScale, this.playerScale);
    }
  }

  handleObstacleHit(player, obstacle) {
    if (this.gameOver) return;
    if (this.isInvincible) {
      // Consume shield on first hit, restore normal color
      this.isInvincible = false;
      this.activePowerKey = null;
      this.applyStateVisual(this.playerState);
      if (obstacle && obstacle.destroy) obstacle.destroy();
      this.showPowerFeedback('shield-spent');
      this.playShieldHitSound();
      return;
    }
    this.gameOver = true;

    this.physics.world.pause();
    this.cameras.main.shake(120, 0.01);
    this.player.setTint(0xff5252);
    this.player.setVelocity(0, 0);
    this.player.body.setGravityY(0);
    this.playDeathSound();
    // Enter a paused state; update() listens for SPACE to call scene.restart() and rebuild the run
    this.showGameOverMessage();
  }

  showGameOverMessage() {
    const { centerX, centerY } = this.cameras.main;
    if (this.qualifiesForHighScore(this.score)) {
      this.showInitialsEntry(centerX, centerY);
      return;
    }
    const highScores = this.loadHighScores().sort((a, b) => b.score - a.score).slice(0, 5);
    this.showGameOverPanel(centerX, centerY, highScores);
  }

  showGameOverPanel(centerX, centerY, highScores) {
    const panelWidth = 360;
    const panelHeight = 260;
    const baseY = centerY - panelHeight / 2;

    const bg = this.add.rectangle(centerX, centerY, panelWidth, panelHeight, 0xffffff, 0.92)
      .setStrokeStyle(3, 0x0b4b5a, 0.9)
      .setScrollFactor(0)
      .setDepth(9);

    const titleY = baseY + 30;
    const title = this.add.text(centerX, titleY, 'GAME OVER', {
      fontSize: '28px',
      color: '#0b4b5a',
      fontStyle: 'bold',
      align: 'center'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(10).setWordWrapWidth(panelWidth - 40);

    const listTitleY = titleY + 36;
    const listTitle = this.add.text(centerX, listTitleY, 'TOP 5', {
      fontSize: '18px',
      color: '#0b4b5a',
      fontStyle: 'bold',
      align: 'center'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(10);

    const listItems = highScores.map((entry, idx) => `${idx + 1}. ${(entry?.initials || '---').padEnd(3, ' ')} - ${entry?.score ?? 0}`);
    const listY = listTitleY + 26;
    const listText = this.add.text(centerX, listY, listItems.join('\n'), {
      fontSize: '16px',
      color: '#0b4b5a',
      align: 'center'
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(10).setWordWrapWidth(panelWidth - 40);

    const restartY = listY + (listItems.length * 18) + 24;
    const restart = this.add.text(centerX, restartY, 'Press SPACE to restart', {
      fontSize: '16px',
      color: '#0b4b5a',
      fontStyle: 'bold',
      align: 'center'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(10).setWordWrapWidth(panelWidth - 40);

    const restartHit = this.add.rectangle(centerX, restartY, panelWidth - 40, 44, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true })
      .setScrollFactor(0)
      .setDepth(11);
    restartHit.on('pointerdown', () => this.restartFromUI());

    this.gameOverPanel = this.add.container(0, 0, [bg, title, listTitle, listText, restartHit, restart]);
  }

  showInitialsEntry(centerX, centerY) {
    this.isEnteringInitials = true;
    this.initials = ['A', 'A', 'A'];
    this.initialsIndex = 0;

    const panelWidth = 360;
    const panelHeight = 220;
    const baseY = centerY - panelHeight / 2;

    const bg = this.add.rectangle(centerX, centerY, panelWidth, panelHeight, 0xffffff, 0.95)
      .setStrokeStyle(3, 0x0b4b5a, 0.9)
      .setScrollFactor(0)
      .setDepth(11);

    const title = this.add.text(centerX, baseY + 28, 'NEW HIGH SCORE!', {
      fontSize: '24px',
      color: '#0b4b5a',
      fontStyle: 'bold',
      align: 'center'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(12);

    const prompt = this.add.text(centerX, baseY + 64, 'ENTER YOUR INITIALS', {
      fontSize: '16px',
      color: '#0b4b5a',
      fontStyle: 'bold',
      align: 'center'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(12);

    this.initialsText = this.add.text(centerX, baseY + 110, this.initials.join(''), {
      fontSize: '32px',
      color: '#0b4b5a',
      fontStyle: 'bold',
      align: 'center'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(12);

    const hint = this.add.text(centerX, baseY + 150, 'Keyboard: letters/backspace/enter\nTouch: tap LEFT to change letter, RIGHT to next/confirm', {
      fontSize: '12px',
      color: '#0b4b5a',
      align: 'center'
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(12).setWordWrapWidth(panelWidth - 40);

    this.initialsOverlay = this.add.container(0, 0, [bg, title, prompt, this.initialsText, hint]);

    this.initialsKeyHandler = (event) => this.handleInitialsKey(event);
    this.initialsPointerHandler = (pointer) => this.handleInitialsPointer(pointer);
    this.input.keyboard.on('keydown', this.initialsKeyHandler);
    this.input.on('pointerdown', this.initialsPointerHandler);
  }

  handleInitialsKey(event) {
    if (!this.isEnteringInitials) return;
    const key = event.key.toUpperCase();
    if (key === 'BACKSPACE') {
      this.initialsIndex = Math.max(0, this.initialsIndex - 1);
      this.initials[this.initialsIndex] = 'A';
      this.updateInitialsText();
      return;
    }
    if ((key === 'ENTER' || key === ' ') && this.initials.length === 3) {
      this.submitInitials();
      return;
    }
    if (/^[A-Z]$/.test(key)) {
      this.initials[this.initialsIndex] = key;
      if (this.initialsIndex < 2) {
        this.initialsIndex += 1;
      }
      this.updateInitialsText();
    }
  }

  handleInitialsPointer(pointer) {
    if (!this.isEnteringInitials) return;
    const leftSide = pointer.x < this.scale.width / 2;
    if (leftSide) {
      // Cycle current letter forward
      const current = this.initials[this.initialsIndex].charCodeAt(0) - 65;
      const next = (current + 1) % 26;
      this.initials[this.initialsIndex] = String.fromCharCode(65 + next);
      this.updateInitialsText();
    } else {
      // Move to next letter or submit
      if (this.initialsIndex < 2) {
        this.initialsIndex += 1;
      } else {
        this.submitInitials();
      }
      this.updateInitialsText();
    }
  }

  submitInitials() {
    if (!this.isEnteringInitials) return;
    const initials = this.initials.join('').substring(0, 3);
    this.teardownInitialsInput();
    const updated = this.updateHighScores(this.score, initials);
    this.showGameOverPanel(this.cameras.main.centerX, this.cameras.main.centerY, updated);
  }

  updateInitialsText() {
    if (!this.initialsText) return;
    this.initialsText.setText(this.initials.join(''));
  }

  teardownInitialsInput() {
    if (this.initialsKeyHandler) {
      this.input.keyboard.off('keydown', this.initialsKeyHandler);
      this.initialsKeyHandler = null;
    }
    if (this.initialsPointerHandler) {
      this.input.off('pointerdown', this.initialsPointerHandler);
      this.initialsPointerHandler = null;
    }
    if (this.initialsOverlay) {
      this.initialsOverlay.destroy(true);
      this.initialsOverlay = null;
    }
    this.isEnteringInitials = false;
  }

  restartFromUI() {
    if (!this.gameOver || this.isEnteringInitials) return;
    this.physics.world.resume();
    this.scene.restart();
  }

  startSpin(now) {
    this.isSpinning = true;
    this.spinEndAt = now + 350;
    this.spinCooldownAt = now + 650; // small buffer to avoid spam
    this.tweens.add({
      targets: this.player,
      angle: this.player.angle + 360,
      duration: 350,
      ease: 'Cubic.InOut'
    });
  }

  updateSpin() {
    if (!this.isSpinning) return;
    const now = this.time.now;
    if (now >= this.spinEndAt) {
      this.isSpinning = false;
      if (this.jumpSpinTween) {
        this.jumpSpinTween.stop();
        this.jumpSpinTween = null;
      }
    }
  }

  handlePowerupPickup(key) {
    if (this.gameOver) return;
    if (key === 'power-invincible') {
      // Invincibility is a single-hit shield; ignore if already active
      if (this.isInvincible) return;
      this.clearTimedPowers();
      this.activateInvincibility();
    } else if (key === 'power-jump') {
      // Ignore jump boost if shield active
      if (this.isInvincible) return;
      this.clearTimedPowers();
      this.activateJumpBoost();
    } else if (key === 'power-speed') {
      if (this.isInvincible) return;
      this.clearTimedPowers();
      this.activateSpeedBoost();
    } else if (key === 'power-double') {
      if (this.isInvincible) return;
      this.clearTimedPowers();
      this.activateDoublePoints();
    } else if (key === 'power-magnet') {
      if (this.isInvincible) return;
      this.clearTimedPowers();
      this.activateMagnet();
    }
  }

  playJumpSpin() {
    // Prevent stacking; skip if fast-fall spin is active
    if (this.isSpinning) return;
    if (this.jumpSpinTween && this.jumpSpinTween.isPlaying()) return;
    this.jumpSpinTween = this.tweens.add({
      targets: this.player,
      angle: 360,
      duration: 400,
      ease: 'Quad.Out',
      onComplete: () => {
        this.jumpSpinTween = null;
      }
    });
  }

  getActiveTint() {
    if (this.isInvincible) return 0xfff066;
    if (this.isJumpBoosted) return 0x7fffd4;
    if (this.isSpeedBoosted) return 0xff4757;
    if (this.hasDoublePoints) return 0xffa502;
    if (this.hasMagnet) return 0xe056fd;
    return 0xffffff;
  }

  activateInvincibility() {
    // Single-hit shield; no duration, ignore if already active
    if (this.isInvincible) return;
    this.isInvincible = true;
    this.activePowerKey = 'power-invincible';
    this.activePowerDuration = 0;
    this.activePowerEndsAt = 0;
    this.applyStateVisual(this.playerState);
    this.showPowerFeedback('power-invincible');
    this.playPowerSound();
  }

  activateJumpBoost() {
    this.isJumpBoosted = true;
    this.jumpVelocity = this.baseJumpVelocity * 1.25;
    this.activePowerKey = 'power-jump';
    this.activePowerDuration = 4000;
    this.activePowerEndsAt = this.time.now + this.activePowerDuration;
    this.applyStateVisual(this.playerState);
    this.showPowerFeedback('power-jump');
    this.playPowerSound();
    this.schedulePowerClear(4000);
  }

  schedulePowerClear(durationMs) {
    if (this.powerTimer) {
      this.powerTimer.remove(false);
    }
    this.powerTimer = this.time.delayedCall(durationMs, () => this.clearPowerups());
  }

  clearPowerups() {
    this.isInvincible = false;
    this.isJumpBoosted = false;
    this.isSpeedBoosted = false;
    this.hasDoublePoints = false;
    this.hasMagnet = false;
    this.jumpVelocity = this.baseJumpVelocity;
    this.applyStateVisual(this.playerState);
    if (this.powerIcon) {
      this.powerIcon.setVisible(false);
    }
    if (this.powerMessage) {
      this.powerMessage.setAlpha(0);
    }
    if (this.powerRing) {
      this.powerRing.clear();
    }
    this.activePowerKey = null;
    this.activePowerDuration = 0;
    this.activePowerEndsAt = 0;
    this.powerTimer = null;
  }
  
  clearTimedPowers() {
    this.isJumpBoosted = false;
    this.isSpeedBoosted = false;
    this.hasDoublePoints = false;
    this.hasMagnet = false;
    this.jumpVelocity = this.baseJumpVelocity;
  }

  showPowerFeedback(key) {
    const meta = this.getPowerMeta(key);
    if (this.powerIcon && meta.icon) {
      this.powerIcon.setTexture(meta.icon);
      this.powerIcon.setVisible(true);
    }
    if (!this.powerMessage) return;
    this.powerMessage.setText(meta.message || '');
    if (this.powerMessageTween) {
      this.powerMessageTween.stop();
    }
    this.powerMessage.setAlpha(0);
    this.powerMessageTween = this.tweens.add({
      targets: this.powerMessage,
      alpha: 1,
      duration: 200,
      ease: 'Quad.Out',
      yoyo: true,
      hold: 900,
      onComplete: () => { this.powerMessageTween = null; }
    });
  }

  getPowerMeta(key) {
    const map = {
      'power-invincible': {
        icon: 'hud-power-inv',
        message: 'ESCUDO ACTIVO'
      },
      'shield-spent': {
        icon: 'hud-power-inv',
        message: 'ESCUDO CONSUMIDO'
      },
      'power-jump': {
        icon: 'hud-power-jump',
        message: 'SUPER SALTO ACTIVADO'
      },
      'power-speed': {
        icon: 'hud-power-speed',
        message: 'VELOCIDAD AUMENTADA'
      },
      'power-double': {
        icon: 'hud-power-double',
        message: 'PUNTOS DOBLES'
      },
      'power-magnet': {
        icon: 'hud-power-magnet',
        message: 'IMÁN ACTIVADO'
      }
    };
    return map[key] || {};
  }

  qualifiesForHighScore(score) {
    const scores = this.loadHighScores();
    if (scores.length < 5) return true;
    const lowest = scores[scores.length - 1];
    return score > (lowest?.score ?? 0);
  }

  loadHighScores() {
    try {
      const raw = localStorage.getItem('bike-runner-highscores');
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed.map((entry) => {
        if (typeof entry === 'number') {
          return { score: entry, initials: '---' };
        }
        return {
          score: Number(entry.score) || 0,
          initials: typeof entry.initials === 'string' ? entry.initials : '---'
        };
      });
    } catch (e) {
      return [];
    }
  }

  updateHighScores(score, initials = '---') {
    const scores = this.loadHighScores();
    scores.push({ score, initials: initials || '---' });
    const sorted = scores.sort((a, b) => b.score - a.score).slice(0, 5);
    try {
      localStorage.setItem('bike-runner-highscores', JSON.stringify(sorted));
    } catch (e) {
      // ignore storage errors
    }
    return sorted;
  }

  updatePowerRing() {
    if (!this.powerRing) return;
    this.powerRing.clear();
    if (!this.activePowerKey || !this.activePowerEndsAt || !this.activePowerDuration) return;
    const remaining = this.activePowerEndsAt - this.time.now;
    if (remaining <= 0) return;
    const ratio = Phaser.Math.Clamp(remaining / this.activePowerDuration, 0, 1);
    const centerX = this.scale.width - 40;
    const centerY = 60;
    const radius = 16;
    this.powerRing.lineStyle(3, 0x0b4b5a, 0.9);
    this.powerRing.beginPath();
    this.powerRing.arc(centerX, centerY, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio, false);
    this.powerRing.strokePath();
  }

  playPowerSound() {
    // Lightweight synth beep; runs without pausing or assets
    const ctx = this.sound.context;
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(760, now);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  }
  
  playJumpSound() {
    const ctx = this.sound.context;
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.1);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  }
  
  playDeathSound() {
    const ctx = this.sound.context;
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.3);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.35);
  }
  
  playShieldHitSound() {
    const ctx = this.sound.context;
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(900, now);
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.08);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  }
  
  getBiomeImageKey(biome) {
    const biomeMap = {
      desert: 'bg-desierto',
      snow: 'bg-nieve',
      pradera: 'bg-pradera',
      volcano: 'bg-volcan'
    };
    return biomeMap[biome] || 'bg-desierto';
  }

  getBiomeObstacleKey(biome) {
    const obstacleMap = {
      desert: 'obstacle-desert',
      snow: 'obstacle-snow',
      pradera: 'obstacle-pradera',
      volcano: 'obstacle-volcano'
    };
    return obstacleMap[biome] || 'obstacle-desert';
  }

  getBiomeTileKey(biome) {
    const tileMap = {
      desert: 'tile-desert',
      snow: 'tile-snow',
      pradera: 'tile-pradera',
      volcano: 'tile-volcano'
    };
    return tileMap[biome] || 'tile-desert';
  }
  
  updateBiome() {
    const biomeIndex = Math.floor(this.score / this.biomeChangeScore);
    const newBiome = this.biomes[biomeIndex % this.biomes.length];
    
    if (newBiome !== this.currentBiome) {
      this.currentBiome = newBiome;
      this.transitionBiome(newBiome);
      this.showBiomeMessage(newBiome);
      this.playBiomeSound();
    }
  }
  
  transitionBiome(biome) {
    const bgKey = this.getBiomeImageKey(biome);

    if (this.backgroundLayers.sky) {
      // Fade out old background
      this.tweens.add({
        targets: this.backgroundLayers.sky,
        alpha: 0,
        duration: 500,
        onComplete: () => {
          // Change texture and fade in
          this.backgroundLayers.sky.setTexture(bgKey);
          this.tweens.add({
            targets: this.backgroundLayers.sky,
            alpha: 1,
            duration: 500
          });
        }
      });
    }
  }
  
  showBiomeMessage(biome) {
    const biomeNames = {
      desert: 'DESIERTO',
      snow: 'NIEVE',
      pradera: 'PRADERA',
      volcano: 'VOLCÁN'
    };
    
    if (this.biomeText) {
      this.biomeText.destroy();
    }
    
    this.biomeText = this.add.text(this.scale.width / 2, this.scale.height / 2, 
      `NUEVO BIOMA: ${biomeNames[biome] || biome.toUpperCase()}`, {
      fontSize: '32px',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 6,
      align: 'center'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(15).setAlpha(0);
    
    this.tweens.add({
      targets: this.biomeText,
      alpha: 1,
      duration: 300,
      yoyo: true,
      hold: 1500,
      onComplete: () => {
        if (this.biomeText) {
          this.biomeText.destroy();
          this.biomeText = null;
        }
      }
    });
  }
  
  playBiomeSound() {
    const ctx = this.sound.context;
    if (!ctx) return;
    const now = ctx.currentTime;
    
    // Play ascending chord
    [440, 554, 659].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.05);
      gain.gain.setValueAtTime(0.1, now + i * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.05 + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.05);
      osc.stop(now + i * 0.05 + 0.35);
    });
  }
  
  activateSpeedBoost() {
    this.isSpeedBoosted = true;
    this.activePowerKey = 'power-speed';
    this.activePowerDuration = 5000;
    this.activePowerEndsAt = this.time.now + this.activePowerDuration;
    this.applyStateVisual(this.playerState);
    this.showPowerFeedback('power-speed');
    this.playPowerSound();
    this.schedulePowerClear(5000);
  }
  
  activateDoublePoints() {
    this.hasDoublePoints = true;
    this.activePowerKey = 'power-double';
    this.activePowerDuration = 6000;
    this.activePowerEndsAt = this.time.now + this.activePowerDuration;
    this.applyStateVisual(this.playerState);
    this.showPowerFeedback('power-double');
    this.playPowerSound();
    this.schedulePowerClear(6000);
  }
  
  activateMagnet() {
    this.hasMagnet = true;
    this.activePowerKey = 'power-magnet';
    this.activePowerDuration = 7000;
    this.activePowerEndsAt = this.time.now + this.activePowerDuration;
    this.applyStateVisual(this.playerState);
    this.showPowerFeedback('power-magnet');
    this.playPowerSound();
    this.schedulePowerClear(7000);
  }
  
  updateMagnet() {
    if (!this.hasMagnet || !this.player) return;
    
    this.powerups.children.iterate((powerup) => {
      if (!powerup || !powerup.active) return;
      
      const distance = Phaser.Math.Distance.Between(
        this.player.x, this.player.y,
        powerup.x, powerup.y
      );
      
      if (distance < this.magnetRadius) {
        const angle = Phaser.Math.Angle.Between(
          powerup.x, powerup.y,
          this.player.x, this.player.y
        );
        
        const speed = 400;
        powerup.x += Math.cos(angle) * speed * (1 / 60);
        powerup.y += Math.sin(angle) * speed * (1 / 60);
      }
    });
  }

  updateBackgroundParallax() {
    // Background is static - no parallax movement
    // Backgrounds only change when switching biomes
  }

  spawnPlatformsIfNeeded() {
    if (this.gameOver || !this.player) return;
    const now = this.time.now;
    if (now < this.nextPlatformAt) return;
    
    // Spawn platforms occasionally for variety
    if (Math.random() < 0.3) {
      this.spawnPlatform();
    }
    
    this.nextPlatformAt = now + Phaser.Math.Between(3000, 6000);
  }
  
  spawnPlatform() {
    const camera = this.cameras.main;
    const spawnX = camera.scrollX + this.scale.width + Phaser.Math.Between(100, 300);
    const groundY = this.scale.height - 40;
    const platformY = groundY - Phaser.Math.Between(80, 140);
    const platformWidth = Phaser.Math.Between(100, 200);

    // Get tile sprite for current biome
    const tileKey = this.getBiomeTileKey(this.currentBiome);
    const tileScale = 0.128;

    // Create platform using biome tile texture repeated
    const numTiles = Math.ceil(platformWidth / 128);
    for (let i = 0; i < numTiles; i++) {
      const tile = this.platforms.create(spawnX + i * 128, platformY, tileKey);
      tile.setOrigin(0, 0.5);
      tile.setScale(tileScale);
      tile.refreshBody();
    }
  }
  
  cleanupPlatforms() {
    const cameraLeft = this.cameras.main.scrollX;
    this.platforms.children.iterate((child) => {
      if (!child || !child.active) return;
      if (child.x < cameraLeft - 200) {
        child.destroy();
      }
    });
  }
}
