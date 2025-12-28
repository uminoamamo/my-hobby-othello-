 document.addEventListener('DOMContentLoaded', () => {
    // --- 定数定義 ---
    const BOARD_SIZE = 8;
    const EMPTY = 0;
    const BLACK = 1;
    const WHITE = 2;
    const DIRECTIONS = [
        [-1, -1], [-1, 0], [-1, 1],
        [0, -1],           [0, 1],
        [1, -1], [1, 0], [1, 1]
    ];

    // --- ゲーム状態変数 ---
    let board = [];
    let currentPlayer = BLACK;
    let turnCount = 0;
    // 設定
    let isCpuEnabled = false;
    let isPassEnabled = true;
    let isUndoEnabled = true;
    let isMineMode = false;
    
    // 削除機能の設定
    let settingMaxRemoveCount = 3;  // タイトルで設定する最大数
    let settingStartTurn = 20;      // 解禁ターン
    let settingRemoveInterval = 3;  // 再使用間隔
    // 地雷モード設定
    let settingMaxMines = 3;
    let mineMap = [];
    // 削除機能の状態 (プレイヤー別に管理)
    // 1: Black, 2: White
    let removeCounts = { 1: 0, 2: 0 };
    let lastRemoveTurns = { 1: -999, 2: -999 }; // 十分小さい値で初期化

    // 履歴管理 (Undo用)
    let historyStack = [];

    // --- DOM要素の取得 ---
    const startScreen = document.getElementById('start-screen');
    const gameScreen = document.getElementById('game-screen');
    
    // 設定入力要素
    const cpuStartToggle = document.getElementById('cpuStartToggle');
    const passStartToggle = document.getElementById('passStartToggle');
    const undoStartToggle = document.getElementById('undoStartToggle');
    const removeCountSelect = document.getElementById('removeCountSelect');
    const startTurnSelect = document.getElementById('startTurnSelect');
    const removeIntervalSelect = document.getElementById('removeIntervalSelect');
    const mineModeToggle = document.getElementById('mineModeToggle');
    const maxMinesSelect = document.getElementById('maxMinesSelect');
    const startGameBtn = document.getElementById('startGameBtn');

    // ゲーム画面要素
    const boardElement = document.getElementById('board');
    const currentPlayerElement = document.getElementById('currentPlayer');
    const blackScoreElement = document.getElementById('blackScore');
    const whiteScoreElement = document.getElementById('whiteScore');
    const turnCountElement = document.getElementById('turnCount');
    const messageElement = document.getElementById('message');
    
    const newGameBtn = document.getElementById('newGameBtn');
    const removeRandomBtn = document.getElementById('removeRandomBtn');
    const undoBtn = document.getElementById('undoBtn');

    // ■ ゲーム初期化処理
    function initGame() {
        board = Array(BOARD_SIZE).fill(0).map(() => Array(BOARD_SIZE).fill(EMPTY));
        mineMap = Array(BOARD_SIZE).fill(0).map(() => Array(BOARD_SIZE).fill(0));

        if (isMineMode) {
            let minesPlaced = 0;
            // ユーザーが指定した数（settingMaxMines）だけループ
            while (minesPlaced < settingMaxMines) {
                let rx = Math.floor(Math.random() * BOARD_SIZE);
                let ry = Math.floor(Math.random() * BOARD_SIZE);

                // 中央4マス以外 ＆ まだ地雷がない場所
                if (!((rx >= 3 && rx <= 4) && (ry >= 3 && ry <= 4)) && mineMap[ry][rx] === 0) {
                    mineMap[ry][rx] = 1;
                    minesPlaced++;
                }
            }
        }
        board[3][3] = WHITE;
        board[3][4] = BLACK;
        board[4][3] = BLACK;
        board[4][4] = WHITE;
        
        currentPlayer = BLACK;
        turnCount = 4; // 初期配置で4個
        
        // カウンター初期化 (各プレイヤーに設定回数を付与)
        removeCounts = { 
            1: settingMaxRemoveCount, 
            2: settingMaxRemoveCount 
        };
        // 最終使用ターンをリセット (再使用間隔計算のため)
        lastRemoveTurns = { 
            1: -999, 
            2: -999 
        };
        
        historyStack = [];
        messageElement.textContent = '';
        
        renderBoard();
        updateInfo();
        updateButtonStates();
    }

    // ■ 状態保存 (Undo用)
    function saveGameState() {
        const state = {
            board: JSON.parse(JSON.stringify(board)),
            currentPlayer: currentPlayer,
            turnCount: turnCount,
            mineMap: JSON.parse(JSON.stringify(mineMap)),
            // オブジェクトのコピーを保存
            removeCounts: { ...removeCounts },
            lastRemoveTurns: { ...lastRemoveTurns }
        };
        historyStack.push(state);
    }

    // ■ 待った (Undo)
    function handleUndo() {
        if (historyStack.length === 0) return;

        let stepsBack = (isCpuEnabled) ? 2 : 1;
        if (historyStack.length < stepsBack) stepsBack = historyStack.length;

        let previousState = null;
        for (let i = 0; i < stepsBack; i++) {
            previousState = historyStack.pop();
        }

        if (previousState) {
            board = previousState.board;
            currentPlayer = previousState.currentPlayer;
            turnCount = previousState.turnCount;
            removeCounts = previousState.removeCounts;
            lastRemoveTurns = previousState.lastRemoveTurns;
            mineMap = previousState.mineMap;
            
            messageElement.textContent = '待ったをしました。';
            renderBoard();
            updateInfo();
            updateButtonStates();
        }
    }
    // --- 地雷爆発---
    async function triggerExplosion(x, y) {
        messageElement.textContent = "ドカン！地雷を爆発しました！";
        
        // 1. 盤面に赤色クラスを追加
        boardElement.classList.add('explosion-flash');

        // 2. 1秒間（1000ミリ秒）待機する
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 3. 実際の爆発処理（石を消す）を実行
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                let ny = y + dy;
                let nx = x + dx;
                if (ny >= 0 && ny < BOARD_SIZE && nx >= 0 && nx < BOARD_SIZE) {
                    board[ny][nx] = EMPTY;
                }
            }
        }
        mineMap[y][x] = 0; // 地雷を消去

        // 4. 赤色クラスを削除
        boardElement.classList.remove('explosion-flash');
        
        // 盤面を再描画して石が消えたことを反映
        renderBoard();
    }
    // ■ 盤面描画
    function renderBoard() {
        boardElement.innerHTML = '';
        const validMoves = getValidMoves(currentPlayer);

        for (let y = 0; y < BOARD_SIZE; y++) {
            for (let x = 0; x < BOARD_SIZE; x++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.dataset.x = x;
                cell.dataset.y = y;

                if (board[y][x] !== EMPTY) {
                    const disc = document.createElement('div');
                    disc.className = 'disc ' + (board[y][x] === BLACK ? 'black' : 'white');
                    cell.appendChild(disc);
                } else {
                    if ((!isCpuEnabled || currentPlayer === BLACK) && 
                        validMoves.some(move => move.x === x && move.y === y)) {
                        cell.classList.add('valid-move');
                    }
                }
                boardElement.appendChild(cell);
                // 地雷モード表示
                //if (isMineMode && mineMap[y][x] === 1) {
                //    cell.style.backgroundColor = "#486358"; // わずかに色を変える、またはドットを出す
                //}   
            }
        }
        

    }

    function getFlippableDiscs(x, y, player) {
        if (board[y][x] !== EMPTY) return [];
        const opponent = player === BLACK ? WHITE : BLACK;
        let allFlippableDiscs = [];

        for (const [dy, dx] of DIRECTIONS) {
            let line = [];
            let ny = y + dy;
            let nx = x + dx;
            while (ny >= 0 && ny < BOARD_SIZE && nx >= 0 && nx < BOARD_SIZE && board[ny][nx] === opponent) {
                line.push({ y: ny, x: nx });
                ny += dy;
                nx += dx;
            }
            if (ny >= 0 && ny < BOARD_SIZE && nx >= 0 && nx < BOARD_SIZE && board[ny][nx] === player && line.length > 0) {
                allFlippableDiscs = allFlippableDiscs.concat(line);
            }
        }
        return allFlippableDiscs;
    }
    
    function getValidMoves(player) {
        const moves = [];
        for (let y = 0; y < BOARD_SIZE; y++) {
            for (let x = 0; x < BOARD_SIZE; x++) {
                if (getFlippableDiscs(x, y, player).length > 0) {
                    moves.push({ x, y });
                }
            }
        }
        return moves;
    }

    function placeDisc(x, y) {
        const flippableDiscs = getFlippableDiscs(x, y, currentPlayer);
        if (flippableDiscs.length === 0) return;

        saveGameState();

        board[y][x] = currentPlayer;
        flippableDiscs.forEach(disc => {
            board[disc.y][disc.x] = currentPlayer;
        });

        if (isMineMode && mineMap[y][x] === 1) {
            triggerExplosion(x, y);
        }

        turnCount++;
        renderBoard();
        updateInfo(); 
        switchPlayer();
    }
    
    async function switchPlayer() {
        currentPlayer = (currentPlayer === BLACK) ? WHITE : BLACK;
        updateInfo();
        updateButtonStates();

        let validMoves = getValidMoves(currentPlayer);

        // パス判定
        if (validMoves.length === 0) {
            if (isPassEnabled) {
                messageElement.textContent = `${currentPlayer === BLACK ? '黒' : '白'}はパスします。`;
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                currentPlayer = (currentPlayer === BLACK) ? WHITE : BLACK; 
                updateInfo();
                updateButtonStates();

                validMoves = getValidMoves(currentPlayer);
                if (validMoves.length === 0) {
                    endGame();
                    return;
                }
            } else {
                 endGame();
                 return;
            }
        } else {
            messageElement.textContent = '';
        }
        
        renderBoard();

        // CPUターン
        if (isCpuEnabled && currentPlayer === WHITE) {
            boardElement.removeEventListener('click', handleBoardClick); 
            await new Promise(resolve => setTimeout(resolve, 600)); 
            cpuTurn();
            boardElement.addEventListener('click', handleBoardClick); 
        }
    }
    // 盤面の場所ごとの価値（点数）
    // 隅=120, 角の隣=-40, 端=20, その他=5 など
    const WEIGHTS = [
        [ 120, -20,  5,   10,   10,  5, -20, 120],
        [ -20, -50,  -5,  -5,  -5,  -5, -50, -20],
        [  5,  -5,  15,   7,   7,  15,  -5,  5],
        [  10,  -5,   7,   3,   3,   7,  -5,  10],
        [  10,  -5,   7,   3,   3,   7,  -5,  10],
        [  5,  -5,  15,   7,   7,  15,  -5,  5],
        [ -20, -50,  -5,  -5,  -5,  -5, -50, -20],
        [ 120, -20,  5,   10,   10,  5, -20, 120]
    ];
    // ■ CPU思考 (場所の価値 + ひっくり返す枚数が少ない方を優先)
    function cpuTurn() {
        const validMoves = getValidMoves(WHITE);
        
        if (validMoves.length > 0) {
            let bestMove = validMoves[0];
            let bestScore = -9999; 

            for (const move of validMoves) {
                // 1. 場所の点数を取得
                const positionScore = WEIGHTS[move.y][move.x];

                // 2. ひっくり返す枚数を取得
                const flips = getFlippableDiscs(move.x, move.y, WHITE).length;
                
                let totalScore = 0;

                // ▼ ここで戦略を切り替える ▼
                if (isPassEnabled) {
                    // A. パスあり(通常ルール)の場合：
                    // 「場所」引く「枚数」 ＝ 少ない枚数で良い場所を取る (定石重視・守備的)
                    // 相手に打つ場所を与えないための戦略です。
                    totalScore = positionScore - flips;
                } else {
                    // B. パスなしの場合：
                    // 「場所」足す「枚数」 ＝ 良い場所でたくさん取る (枚数重視・攻撃的)
                    // パスがないルールでは、相手を追い詰めるより自分が生き残る(数を稼ぐ)ことが重要になりやすいためです。
                    totalScore = positionScore + flips;
                }

                // 最良の手を更新
                if (totalScore > bestScore) {
                    bestScore = totalScore;
                    bestMove = move;
                }
            }
            
            placeDisc(bestMove.x, bestMove.y);
        }
    }

    // ■ ランダム石削除機能 
    function handleRemoveRandom() {
        // 現在のプレイヤーの残り回数
        const myLeft = removeCounts[currentPlayer];
        // 次に使えるターン
        const nextUsable = lastRemoveTurns[currentPlayer] + settingRemoveInterval;

        // チェック: 残り回数なし or 解禁ターン前 or クールダウン中
        if (myLeft <= 0 || turnCount < settingStartTurn || turnCount < nextUsable) {
            return;
        }

        const stoneLocations = [];
        for (let y = 0; y < BOARD_SIZE; y++) {
            for (let x = 0; x < BOARD_SIZE; x++) {
                if (board[y][x] !== EMPTY) {
                    stoneLocations.push({ x, y });
                }
            }
        }
        if (stoneLocations.length === 0) return;

        saveGameState();

        const randomIndex = Math.floor(Math.random() * stoneLocations.length);
        const targetStone = stoneLocations[randomIndex];
        board[targetStone.y][targetStone.x] = EMPTY;

        // 回数を消費し、使用ターンを記録
        removeCounts[currentPlayer]--;
        lastRemoveTurns[currentPlayer] = turnCount;

        messageElement.textContent = 'ランダムに石を削除しました！';
        renderBoard();
        updateInfo();
        updateButtonStates();
    }
    // ■ ボタン状態更新 (仕様変更版)
    function updateButtonStates() {
        // --- ランダム削除ボタン ---
        // そもそも機能が無効(回数0)なら非表示
        if (settingMaxRemoveCount <= 0) {
            removeRandomBtn.style.display = 'none';
        } else {
            removeRandomBtn.style.display = 'inline-block';
            
            // 現在のプレイヤーの情報
            const myLeft = removeCounts[currentPlayer];
            const lastUsed = lastRemoveTurns[currentPlayer];
            const nextUsable = lastUsed + settingRemoveInterval;
            
            // ボタンのラベル更新
            // 例: "ランダム削除 (黒:あと3回)"
            const playerName = (currentPlayer === BLACK) ? "黒" : "白";
            removeRandomBtn.textContent = `ランダム削除 (${playerName}:残${myLeft})`;

            // 有効化条件:
            // 1. CPUのターンではない (A案)
            // 2. 残り回数がある
            // 3. 全体解禁ターン(20等)に達している
            // 4. 個別クールダウンが明けている
            const isCpuTurn = (isCpuEnabled && currentPlayer === WHITE);
            const isTurnReached = (turnCount >= settingStartTurn);
            const isCooldownClear = (turnCount >= nextUsable);

            if (!isCpuTurn && myLeft > 0 && isTurnReached && isCooldownClear) {
                removeRandomBtn.disabled = false;
            } else {
                removeRandomBtn.disabled = true;
                
                // 理由をラベルに追記して親切に
                if (isCpuTurn) {
                    removeRandomBtn.textContent = "CPU思考中...";
                } else if (!isTurnReached) {
                    removeRandomBtn.textContent = `待機中 (解禁:${settingStartTurn})`;
                } else if (!isCooldownClear) {
                    removeRandomBtn.textContent = `待機中 (次は:${nextUsable})`;
                } else if (myLeft <= 0) {
                    removeRandomBtn.textContent = `回数切れ`;
                }
            }
        }
        

        // --- 待ったボタン ---
        if (!isUndoEnabled) {
            undoBtn.style.display = 'none';
        } else {
            undoBtn.style.display = 'inline-block';
            if (historyStack.length === 0 || (isCpuEnabled && currentPlayer === WHITE)) {
                undoBtn.disabled = true;
            } else {
                undoBtn.disabled = false;
            }
        }
    }
    
    function updateInfo() {
        let blackCount = 0;
        let whiteCount = 0;
        board.forEach(row => {
            row.forEach(cell => {
                if (cell === BLACK) blackCount++;
                if (cell === WHITE) whiteCount++;
            });
        });
        blackScoreElement.textContent = blackCount;
        whiteScoreElement.textContent = whiteCount;
        currentPlayerElement.textContent = (currentPlayer === BLACK) ? '黒' : '白';
        turnCountElement.textContent = turnCount;
    }

    function endGame() {
        const blackCount = parseInt(blackScoreElement.textContent);
        const whiteCount = parseInt(whiteScoreElement.textContent);
        let resultMessage = (blackCount > whiteCount) ? '黒の勝ちです！' : (whiteCount > blackCount) ? '白の勝ちです！' : '引き分けです。';
        messageElement.textContent = `ゲーム終了！ ${resultMessage}`;
        updateButtonStates();
    }
    
    function handleBoardClick(e) {
         if (!e.target.classList.contains('cell')) return;
         if (isCpuEnabled && currentPlayer === WHITE) return;

        const x = parseInt(e.target.dataset.x);
        const y = parseInt(e.target.dataset.y);
        placeDisc(x, y);
    }

    // --- イベントリスナー ---
    boardElement.addEventListener('click', handleBoardClick);
    
    startGameBtn.addEventListener('click', () => {
        // 設定読み込み
        isCpuEnabled = cpuStartToggle.checked;
        isPassEnabled = passStartToggle.checked;
        isUndoEnabled = undoStartToggle.checked;
        isMineMode = mineModeToggle.checked;
        
        settingMaxRemoveCount = parseInt(removeCountSelect.value, 10);
        settingStartTurn = parseInt(startTurnSelect.value, 10);
        settingRemoveInterval = parseInt(removeIntervalSelect.value, 10);
        settingMaxMines = parseInt(maxMinesSelect.value, 10);

        startScreen.style.display = 'none';
        gameScreen.style.display = 'flex';
        initGame();
    });

    newGameBtn.addEventListener('click', () => {
        gameScreen.style.display = 'none';
        startScreen.style.display = 'flex';
    });

    removeRandomBtn.addEventListener('click', handleRemoveRandom);
    undoBtn.addEventListener('click', handleUndo);
    // 「g」キー入力を監視
    window.addEventListener('keydown', (e) => {
        // ゲーム画面が表示されている時だけ有効にする
        if (gameScreen.style.display === 'flex') {
            if (e.key === 'g' || e.key === 'G') {
                const boardElement = document.getElementById('board');
                
                // クラスを付け外しする
                boardElement.classList.toggle('gray-active');
                
                // メッセージを表示してプレイヤーに知らせる
                if (boardElement.classList.contains('gray-active')) {
                    messageElement.textContent = "🕵️ グレーモード起動：石の色が隠されました！";
                } else {
                    messageElement.textContent = "明かりが灯りました。";
                }
            }
            else if (isMineMode && (e.key === 'm' || e.key === 'M')) {
                 // 地雷モード表示
                for (let y = 0; y < BOARD_SIZE; y++) {
                    for (let x = 0; x < BOARD_SIZE; x++) {
                        const cell = document.querySelector(`.cell[data-x="${x}"][data-y="${y}"]`);
                        if (mineMap[y][x] === 1) {
                            cell.style.backgroundColor = "#486358"; // わずかに色を変える、またはドットを出す
                        } 
                        else {
                            cell.style.backgroundColor = ""; // 元に戻す
                        }
                    }
                }
            }
        }
    });
});