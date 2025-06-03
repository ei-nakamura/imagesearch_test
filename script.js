const videoElement = document.getElementById('videoElement');
const canvasElement = document.getElementById('canvasElement');
const toggleCameraButton = document.getElementById('toggleCameraButton');
const captureButton = document.getElementById('captureButton');
const searchButton = document.getElementById('searchButton');
const cameraSelectList = document.getElementById('cameraSelectList');
const statusMessage = document.getElementById('status-message');
const errorMessage = document.getElementById('error-message');

let currentStream = null;
let cameraActive = false;

// --- カメラ制御 ---

async function getCameraDevices() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        
        cameraSelectList.innerHTML = ''; // 既存の選択肢をクリア
        if (videoDevices.length > 0) {
            videoDevices.forEach((device, index) => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.text = device.label || `カメラ ${index + 1}`;
                cameraSelectList.appendChild(option);
            });
            cameraSelectList.style.display = 'inline-block';
            return videoDevices;
        } else {
            cameraSelectList.style.display = 'none';
            showError('利用可能なカメラが見つかりません。');
            return [];
        }
    } catch (err) {
        showError(`カメラデバイスの取得に失敗: ${err.message}`);
        console.error("Error enumerating devices:", err);
        cameraSelectList.style.display = 'none';
        return [];
    }
}

async function startCamera(deviceId) {
    if (currentStream) {
        stopStream(); // 既存のストリームを停止
    }

    const constraints = {
        video: {
            deviceId: deviceId ? { exact: deviceId } : undefined,
            width: { ideal: 1280 }, // 希望する解像度
            height: { ideal: 720 }
        }
    };

    try {
        showStatus('カメラを起動中...');
        currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        videoElement.srcObject = currentStream;
        videoElement.onloadedmetadata = () => {
            videoElement.play();
            // ビデオの実際の解像度に合わせてCanvasの内部解像度を設定
            canvasElement.width = videoElement.videoWidth;
            canvasElement.height = videoElement.videoHeight;
        };

        videoElement.style.display = 'block';
        canvasElement.style.display = 'none'; // 撮影前の状態に戻す
        
        captureButton.disabled = false;
        searchButton.disabled = true; // 新しいカメラなので、撮影するまで検索不可
        toggleCameraButton.textContent = 'カメラ停止';
        cameraActive = true;
        showStatus('カメラ起動中。撮影ボタンで画像をキャプチャできます。');
        clearError();
    } catch (err) {
        console.error("Error starting camera:", err);
        let msg = `カメラアクセスエラー: ${err.name} - ${err.message}`;
        if (err.name === "NotAllowedError") {
            msg = "カメラへのアクセスが拒否されました。ブラウザの設定を確認してください。";
        } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
            msg = "選択されたカメラが見つかりません。";
        } else if (err.name === "NotReadableError") {
            msg = "カメラが他のアプリケーションで使用されているか、ハードウェアエラーの可能性があります。";
        } else if (err.name === "OverconstrainedError" || err.name === "ConstraintNotSatisfiedError") {
            msg = `指定された解像度でカメラを起動できませんでした。${err.message}`;
            // 解像度指定なしで再試行するなどのフォールバックも検討可能
        }
        showError(msg);
        resetUIOnCameraFailure();
    }
}

function stopStream() {
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        videoElement.srcObject = null;
        currentStream = null;
    }
}

function stopCamera() {
    stopStream();
    videoElement.style.display = 'none';
    // canvasElement は撮影済み画像があれば表示したまま
    captureButton.disabled = true;
    // searchButton は撮影済みなら有効のまま
    toggleCameraButton.textContent = 'カメラ起動';
    cameraActive = false;
    cameraSelectList.style.display = 'none'; // カメラ選択も非表示
    showStatus('カメラを停止しました。「カメラ起動」で再開できます。');
}

function resetUIOnCameraFailure() {
    stopStream();
    videoElement.style.display = 'none';
    canvasElement.style.display = 'none';
    captureButton.disabled = true;
    searchButton.disabled = true;
    toggleCameraButton.textContent = 'カメラ起動';
    cameraActive = false;
    cameraSelectList.style.display = 'none'; // カメラ選択も非表示
}

// --- UI制御とイベントリスナー ---

toggleCameraButton.addEventListener('click', async () => {
    if (cameraActive) {
        stopCamera();
    } else {
        clearError();
        showStatus('カメラデバイスを検索中...');
        const videoDevices = await getCameraDevices();
        if (videoDevices.length > 0) {
            // 最初にリストされたカメラ（または以前選択したカメラ）で開始
            startCamera(cameraSelectList.value || videoDevices[0].deviceId);
        } else if (!errorMessage.textContent) { // getCameraDevicesでエラーが表示されていなければ
            showError('カメラが見つかりませんでした。PCまたはブラウザのカメラ設定を確認してください。');
        }
    }
});

cameraSelectList.addEventListener('change', () => {
    if (cameraActive) { // カメラが起動中なら選択変更で再起動
        startCamera(cameraSelectList.value);
    }
});

captureButton.addEventListener('click', () => {
    if (!currentStream || !videoElement.videoWidth) {
        showError('カメラがアクティブではありません。');
        return;
    }
    // ビデオの実際の解像度に合わせてCanvasの内部解像度を再設定 (起動時と異なる場合があるため)
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;

    const context = canvasElement.getContext('2d');
    context.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);

    canvasElement.style.display = 'block';
    // videoElement.style.display = 'none'; // 撮影後ビデオを隠す場合はコメント解除
    searchButton.disabled = false;
    showStatus('画像を撮影しました。「画像で検索」ボタンで検索できます。');
    clearError();
});

searchButton.addEventListener('click', () => {
    if (canvasElement.width === 0 || canvasElement.height === 0) {
        showError('検索する画像がありません。まず画像を撮影してください。');
        return;
    }
    // canvasに何も描画されていない場合（getContextは成功するが中身が空）のチェック
    const context = canvasElement.getContext('2d');
    try {
        const check = context.getImageData(0,0,1,1);
        if (check.data.every(val => val === 0)) { // 透明なピクセルなら警告
             showError('撮影された画像が空のようです。再撮影してください。');
             return;
        }
    } catch(e) {
        showError('Canvasから画像データを取得できませんでした。');
        return;
    }


    showStatus('画像を処理中...');
    // toDataURLは同期処理。大きな画像だとUIが少し固まる可能性あり。
    // 品質 (第2引数): 0.0 (低品質) - 1.0 (高品質)
    const dataURL = canvasElement.toDataURL('image/jpeg', 0.9);

    if (dataURL === "data:,") { // 空のDataURLチェック
        showError('有効な画像データの取得に失敗しました。もう一度撮影してください。');
        showStatus('');
        return;
    }

    // Google Lens の "upload by URL" 機能を利用
    // const searchUrl = `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(dataURL)}`;
    // または、従来のGoogle画像検索 (Lensにリダイレクトされることが多い)
    const searchUrl = `https://www.google.com/searchbyimage?image_url=${encodeURIComponent(dataURL)}`;

    window.open(searchUrl, '_blank'); // 新しいタブで検索結果を開く
    showStatus('新しいタブで検索結果を開きました。');
});

function showStatus(message) {
    statusMessage.textContent = message;
}

function showError(message) {
    errorMessage.textContent = message;
}

function clearError() {
    errorMessage.textContent = '';
}

// 初期化処理
document.addEventListener('DOMContentLoaded', () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showError('お使いのブラウザはカメラ機能をサポートしていません。');
        toggleCameraButton.disabled = true;
        captureButton.disabled = true;
        searchButton.disabled = true;
        return;
    }
    showStatus('「カメラ起動」ボタンを押して開始してください。');
});