import { findFrom, findAndDestroyFrom } from '../utils/utils.js';
import { TILESET, LAYER } from '../utils/constants.js';

import Player from '../entities/player.js';
import EnemyPlayer from '../entities/enemy_player.js';
import Bomb from '../entities/bomb.js';
import Spoil from '../entities/spoil.js';
import FireBlast from '../entities/fire_blast.js';
import Bone from '../entities/bone.js';

class Play extends Phaser.Scene {

  constructor () {
    super('Play');
  }

  init(game) {
    this.socket=this.registry.get('socketIO');
    this.currentGame = game
  }

  create() {
    this.createMap();
    this.createPlayers();
    this.setEventHandlers();
    //this.game.time.events.loop(400 , this.stopAnimationLoop.bind(this));

    this.model = this.registry.get('Model');

    if (!this.model.bgMusicPlaying === false){
      this.sound.stopAll();
      this.model.bgMusicPlaying = false;
      this.registry.set('Model', this.bgMusic);
    }
    if (this.model.musicOn === true) {
      this.bgMusic = this.sound.add('bgMusic03', { volume: 0.5, loop: true });
      this.bgMusic.play();
      this.model.bgMusicPlaying = true;
      this.model.bgMusic='bgMusic03';
      this.registry.set('Model', this.model);
    }
  }

  update() {
    this.physics.add.collider(this.player, this.blockLayer);
    this.physics.add.collider(this.player, this.enemies);
    this.physics.add.collider(this.player, this.bombs);

    this.physics.overlap(this.player, this.spoils, this.onPlayerVsSpoil, null, this);
    this.physics.overlap(this.player, this.blasts, this.onPlayerVsBlast, null, this);
    this.player.update();
    this.stopAnimationLoop();
  }

  createMap() {
    this.map = this.add.tilemap('hot_map');

    const tileset=this.map.addTilesetImage(TILESET,null, 35, 35, 0, 0);
    this.blockLayer = this.map.createLayer(LAYER, tileset);

    this.map.setCollision(this.blockLayer.layer.properties.collisionTiles)

    this.player  = null;
    this.bones   = this.add.group({key: 'bones'});
    this.bombs   = this.add.group({key: 'bombs'});
    this.spoils  = this.add.group({key: 'spoils'});
    this.blasts  = this.add.group({key: 'blasts'});
    this.enemies = this.add.group({key: 'enemies'});
  }

  createPlayers() {
    for (let player of Object.values(this.currentGame.players)) {
      let setup = {
        game:   this,
        id:     player.id,
        spawn:  player.spawn,
        skin:   player.skin
      }

      if (player.id === this.socket.id) {
        this.player = new Player(setup);
      } else {
        this.enemies.add(new EnemyPlayer(setup))
      }
    }
  }

  setEventHandlers() {
    this.socket.on('move player', this.onMovePlayer.bind(this));
    this.socket.on('player win', this.onPlayerWin.bind(this));
    this.socket.on('show bomb', this.onShowBomb.bind(this));
    this.socket.on('detonate bomb', this.onDetonateBomb.bind(this));
    this.socket.on('spoil was picked', this.onSpoilWasPicked.bind(this));
    this.socket.on('show bones', this.onShowBones.bind(this));
    this.socket.on('player disconnect', this.onPlayerDisconnect.bind(this));
  }

  onPlayerVsSpoil(player, spoil) {
    this.socket.emit('pick up spoil', { spoil_id: spoil.id });
    this.spoils.remove(spoil,true,true);
    if (this.model.soundOn === true) {
      let FxPickItem01 = this.sound.add('FxPickItem01', { volume: 0.8, loop: false });
      FxPickItem01.play();
    }
  }

  onPlayerVsBlast(player, blast) {
    if (player.alive) {
      this.socket.emit('player died', { col: player.currentCol(), row: player.currentRow() });
      player.becomesDead()
      if (this.model.soundOn === true) {
        let FxDeath01 = this.sound.add('FxDeath01', { volume: 0.8, loop: false });
        FxDeath01.play();
      }
    }
  }

  onMovePlayer({ player_id, x, y }) {
    let enemy = findFrom(player_id, this.enemies);
    if (!enemy) { return }

    enemy.goTo({ x: x, y: y })
  }

  stopAnimationLoop() {
    for (let enemy of this.enemies.getChildren()) {
      if (!(typeof enemy.lastMoveAt === "undefined") && enemy.lastMoveAt < this.game.getTime() - 200) {
        enemy.anims.stop();
      }
    }
  }

  onShowBomb({ bomb_id, col, row }) {
    this.bombs.add(new Bomb(this, bomb_id, col, row));
  }

  onDetonateBomb({ bomb_id, blastedCells }) {
    // Remove Bomb:
    findAndDestroyFrom(bomb_id, this.bombs)

    if (this.model.soundOn === true) {
      let FxExplosion01 = this.sound.add('FxExplosion01', { volume: 0.8, loop: false });
      FxExplosion01.play();
    }

    // Render Blast:
    for (let cell of blastedCells) {
        this.blasts.add(new FireBlast(this, cell));
    };

    // Destroy Tiles:
    for (let cell of blastedCells) {
      if (!cell.destroyed) { continue }

      this.blockLayer.putTileAt(this.blockLayer.layer.properties.empty, cell.col, cell.row);
    };

    // Add Spoils:
    for (let cell of blastedCells) {
      if (!cell.destroyed) { continue }
      if (!cell.spoil) { continue }

      this.spoils.add(new Spoil(this, cell.spoil));
    };
  }

  onSpoilWasPicked({ player_id, spoil_id, spoil_type }){
    if (player_id === this.player.id){
      this.player.pickSpoil(spoil_type)
    }

    findAndDestroyFrom(spoil_id, this.spoils)
  }

  onShowBones({ player_id, col, row }) {
    this.bones.add(new Bone(this, col, row));

    findAndDestroyFrom(player_id, this.enemies)
    if (this.model.soundOn === true) {
      let FxDeath01 = this.sound.add('FxDeath01', { volume: 0.8, loop: false });
      FxDeath01.play();
    }
  }

  onPlayerWin(winner_skin) {
    this.socket.emit('leave game');

    this.scene.start('Win',winner_skin);
    console.log('ToDo: this.state.start Win: '+winner_skin);
  }

  onPlayerDisconnect({ player_id }) {
    findAndDestroyFrom(player_id, this.enemies);

    if (this.enemies.children.length >= 1) { return }

    this.onPlayerWin()
  }
}

export default Play;
