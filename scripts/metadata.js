import { getFromLocal, setToLocal, METADATA_MAX_ENTRIES, METADATA_STORAGE_KEY } from './storage.js';

// Uint8Array를 Base64 문자열로 변환합니다.
function toBase64(bytes) {
    if (!bytes || !bytes.length) return '';
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
}

// 여러 인코딩으로 데이터를 디코딩 시도합니다.
function decodeWithEncodings(data, encodings = ['utf-8', 'iso-8859-1']) {
    for (const encoding of encodings) {
        try {
            return new TextDecoder(encoding).decode(data);
        } catch (error) {
            console.debug(`텍스트 디코딩 실패 (${encoding}):`, error);
        }
    }
    return '';
}

// Null로 끝나는 문자열을 데이터에서 읽어옵니다.
function readNullTerminated(data, start = 0) {
    let idx = start;
    while (idx < data.length && data[idx] !== 0) {
        idx += 1;
    }
    const value = decodeWithEncodings(data.subarray(start, idx));
    return { value, nextIndex: idx + 1 };
}

// Deflate 알고리즘으로 압축된 데이터를 해제합니다.
async function decompressDeflate(data) {
    try {
        const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate'));
        const arrayBuffer = await new Response(stream).arrayBuffer();
        return new Uint8Array(arrayBuffer);
    } catch (error) {
        console.error('PNG 텍스트 압축 해제 실패:', error);
        return data;
    }
}

// PNG 파일 버퍼에서 메타데이터 청크를 파싱합니다.
export async function parsePngMetadata(buffer) {
    if (!buffer) return [];
    const view = new DataView(buffer);
    const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
    for (let i = 0; i < pngSignature.length; i += 1) {
        if (view.getUint8(i) !== pngSignature[i]) {
            console.warn('PNG 이미지가 아니거나, 데이터가 손상되었습니다.');
            return [];
        }
    }

    const metadataChunks = [];
    let offset = 8;
    while (offset + 8 <= view.byteLength) {
        const length = view.getUint32(offset);
        offset += 4;
        const typeArray = new Uint8Array(buffer, offset, 4);
        const type = String.fromCharCode(...typeArray);
        offset += 4;

        if (offset + length > view.byteLength) {
            console.warn('PNG 이미지가 손상된 것 같습니다.  ');
            break;
        }

        const chunkData = new Uint8Array(buffer, offset, length);
        offset += length + 4; // 데이터 + CRC

        if (type === 'IEND') break;
        if (!['tEXt', 'iTXt', 'zTXt', 'eXIf'].includes(type)) continue;

        const rawBase64 = toBase64(chunkData);
        const chunkRecord = { type, rawBase64 };

        try {
            if (type === 'tEXt') {
                const nullIndex = chunkData.indexOf(0);
                if (nullIndex !== -1) {
                    const keyword = decodeWithEncodings(chunkData.subarray(0, nullIndex), ['iso-8859-1']);
                    const text = decodeWithEncodings(chunkData.subarray(nullIndex + 1));
                    Object.assign(chunkRecord, { keyword, text });
                } else {
                    chunkRecord.text = decodeWithEncodings(chunkData);
                }
            } else if (type === 'zTXt') {
                const { value: keyword, nextIndex } = readNullTerminated(chunkData);
                Object.assign(chunkRecord, { keyword });
                if (nextIndex < 0 || nextIndex >= chunkData.length) {
                    metadataChunks.push(chunkRecord);
                    continue;
                }
                const compressionMethod = chunkData[nextIndex];
                const compressed = chunkData.subarray(nextIndex + 1);
                const decompressed = compressionMethod === 0 ? await decompressDeflate(compressed) : compressed;
                const text = decodeWithEncodings(decompressed);
                Object.assign(chunkRecord, { text, compressed: compressionMethod === 0 });
            } else if (type === 'iTXt') {
                let cursor = 0;
                const keywordInfo = readNullTerminated(chunkData, cursor);
                const keyword = keywordInfo.value;
                cursor = keywordInfo.nextIndex;
                const compressionFlag = chunkData[cursor];
                const compressionMethod = chunkData[cursor + 1];
                cursor += 2;
                const languageInfo = readNullTerminated(chunkData, cursor);
                const languageTag = languageInfo.value;
                cursor = languageInfo.nextIndex;
                const translatedInfo = readNullTerminated(chunkData, cursor);
                const translatedKeyword = translatedInfo.value;
                cursor = translatedInfo.nextIndex;
                const textData = cursor <= chunkData.length ? chunkData.subarray(cursor) : new Uint8Array();

                let textBytes = textData;
                if (compressionFlag === 1 && compressionMethod === 0) {
                    textBytes = await decompressDeflate(textData);
                }
                const text = decodeWithEncodings(textBytes);
                Object.assign(chunkRecord, {
                    keyword,
                    text,
                    languageTag,
                    translatedKeyword,
                    compressed: compressionFlag === 1
                });
            } else if (type === 'eXIf') {
                chunkRecord.text = '[eXIf chunk captured]';
            }
        } catch (error) {
            console.error(`PNG ${type} 청크 파싱 실패:`, error);
        }

        metadataChunks.push(chunkRecord);
    }

    return metadataChunks;
}

// JSON 텍스트를 안전하게 파싱합니다.
export function parseJsonSafely(text) {
    if (!text) return null;
    const cleaned = String(text).trim();
    const tryParse = (value) => {
        try {
            return JSON.parse(value);
        } catch (error) {
            return null;
        }
    };

    let parsed = tryParse(cleaned);
    if (parsed) return parsed;

    const normalized = cleaned.replace(/\u00a0/g, ' ').replace(/\u0000/g, '');
    parsed = tryParse(normalized);
    if (parsed) return parsed;

    console.warn('JSON 파싱 실패.', cleaned.slice(0, 120));
    return null;
}

// 프롬프트 텍스트의 형식을 정리합니다.
function formatPromptText(value) {
    if (!value) return '';
    return String(value).replace(/\u00a0/g, ' ').trim();
}

// 키워드를 기준으로 메타데이터 청크를 찾습니다.
function pickChunkByKeyword(chunks, keyword) {
    const lowerKeyword = keyword.toLowerCase();
    return chunks.find((chunk) => (chunk.keyword || '').toLowerCase() === lowerKeyword) || null;
}

// 프롬프트에서 아티스트 태그를 추출합니다.
function extractArtistTags(prompt) {
    if (!prompt) return [];
    const regex = /artist:([^,:]+)/g;
    const matches = [...prompt.matchAll(regex)];
    return matches.map(match => match[1].trim());
}

// 추출된 메타데이터를 스토리지에 카드로 저장합니다.
export async function saveMetadataCard({ filename, sourceUrl, mimeType, chunks }) {
    if (!Array.isArray(chunks) || !chunks.length) return { success: false };

    try {
        const now = new Date();
        const descriptionChunk = pickChunkByKeyword(chunks, 'Description');
        const commentChunk = pickChunkByKeyword(chunks, 'Comment');
        const sourceChunk = pickChunkByKeyword(chunks, 'Source');

        const commentData = commentChunk?.text ? parseJsonSafely(commentChunk.text) : null;
        const promptText = commentData
            ? formatPromptText(commentData.prompt || commentData?.v4_prompt?.caption?.base_caption)
            : formatPromptText(descriptionChunk?.text);

        const characters = [];
        if (commentData?.v4_prompt?.caption?.char_captions) {
            for (const item of commentData.v4_prompt.caption.char_captions) {
                const caption = formatPromptText(item?.char_caption);
                if (caption) characters.push(caption.replace(/,\s*$/, ''));
            }
        }

        const entry = {
            id: `${now.getTime()}-${Math.random().toString(16).slice(2, 8)}`,
            createdAt: now.toISOString(),
            filename,
            sourceUrl,
            mimeType,
            prompt: promptText,
            characters,
            steps: commentData?.steps ?? null,
            width: commentData?.width ?? null,
            height: commentData?.height ?? null,
            seed: commentData?.seed ?? null,
            sampler: commentData?.sampler ?? null,
            scale: commentData?.scale ?? null,
            uc: commentData?.uc || commentData?.v4_negative_prompt?.caption?.base_caption || null,
            artistTags: extractArtistTags(promptText),
            model: formatPromptText(sourceChunk?.text) || ''
        };

        const stored = await getFromLocal(METADATA_STORAGE_KEY);
        const list = Array.isArray(stored[METADATA_STORAGE_KEY]) ? stored[METADATA_STORAGE_KEY] : [];
        list.push(entry);
        const trimmed = list.slice(-METADATA_MAX_ENTRIES);
        await setToLocal({ [METADATA_STORAGE_KEY]: trimmed });
        return { success: true, entry };
    } catch (error) {
        console.error('메타데이터 카드 저장 실패:', error);
        return { success: false };
    }
}

// 이미지 URL로부터 ArrayBuffer를 가져옵니다.
export async function fetchImageBuffer(src) {
    try {
        if (src.startsWith('data:')) {
            const match = src.match(/^data:(.*?);base64,(.*)$/);
            if (!match) return null;
            const mimeType = match[1] || 'image/png';
            const binary = atob(match[2]);
            const len = binary.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i += 1) {
                bytes[i] = binary.charCodeAt(i);
            }
            return { buffer: bytes.buffer, mimeType };
        }

        const response = await fetch(src, { mode: 'cors', credentials: 'omit', cache: 'no-store' });
        if (!response.ok) throw new Error(`이미지 요청 실패 (${response.status})`);
        const mimeType = response.headers.get('content-type')?.split(';')[0] || 'image/png';
        const buffer = await response.arrayBuffer();
        return { buffer, mimeType };
    } catch (error) {
        console.warn('이미지 버퍼 가져오기 실패:', error);
        return null;
    }
}

// ArrayBuffer를 Canvas 요소로 변환합니다.
async function bufferToCanvas(buffer, mimeType) {
    const blob = new Blob([buffer], { type: mimeType || 'image/png' });
    if (window.createImageBitmap) {
        try {
            const bitmap = await createImageBitmap(blob);
            const canvas = document.createElement('canvas');
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(bitmap, 0, 0);
            if (typeof bitmap.close === 'function') bitmap.close();
            return canvas;
        } catch (error) {
            console.warn('createImageBitmap 변환 실패, Image 요소로 대체합니다.', error);
        }
    }

    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(image, 0, 0);
            URL.revokeObjectURL(image.src);
            resolve(canvas);
        };
        image.onerror = (event) => {
            URL.revokeObjectURL(image.src);
            reject(event.error || new Error('이미지 로드 실패'));
        };
        image.src = URL.createObjectURL(blob);
    });
}

// 데이터 URL을 Canvas 요소로 변환합니다.
async function dataUrlToCanvas(dataUrl) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(image, 0, 0);
            resolve(canvas);
        };
        image.onerror = () => reject(new Error('중간 이미지 로드 실패'));
        image.src = dataUrl;
    });
}

// Canvas를 특정 포맷의 데이터 URL로 변환합니다.
export async function convertCanvasToDataUrl(canvas, targetMimeType, quality) {
    try {
        const needsDoublePass = targetMimeType === 'image/png' || targetMimeType === 'image/webp';
        let workingCanvas = canvas;
        if (needsDoublePass) {
            const jpegDataUrl = canvas.toDataURL('image/jpeg', 1.0);
            workingCanvas = await dataUrlToCanvas(jpegDataUrl);
        }
        const finalQuality = targetMimeType === 'image/png' ? 1.0 : quality;
        return workingCanvas.toDataURL(targetMimeType, finalQuality);
    } catch (error) {
        console.error('캔버스 변환 실패:', error);
        return null;
    }
}

// ArrayBuffer를 특정 포맷의 데이터 URL로 변환합니다.
export async function convertBufferToDataUrl(buffer, sourceMimeType, targetMimeType, quality) {
    if (!buffer) return null;
    try {
        const canvas = await bufferToCanvas(buffer, sourceMimeType);
        return await convertCanvasToDataUrl(canvas, targetMimeType, quality);
    } catch (error) {
        console.error('버퍼 변환 실패:', error);
        return null;
    }
}

