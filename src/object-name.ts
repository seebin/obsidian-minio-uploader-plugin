export interface FileLike {
	name: string;
	type?: string;
}

export interface BuildObjectNameOptions {
	file: FileLike;
	folder?: string;
	pathRule: string;
	nameRule: string;
	now?: Date;
}

export function getFileTypeFromMime(file: FileLike): string {
	const imageType = /image.*/;
	const videoType = /video.*/;
	const audioType = /audio.*/;
	const docType = /application\/(vnd.*|pdf)/;
	const type = file?.type || '';

	if (type.match(videoType)) {
		return 'video';
	} else if (type.match(audioType)) {
		return 'audio';
	} else if (type.match(docType)) {
		return 'doc';
	} else if (type.match(imageType)) {
		return 'image';
	} else {
		return '';
	}
}

export function buildObjectName(options: BuildObjectNameOptions): string {
	const now = options.now || new Date();
	let objectName = normalizeFolder(options.folder);

	switch (options.pathRule) {
		case 'root':
			break;
		case 'type':
			objectName += `${getFileTypeFromMime(options.file)}/`;
			break;
		case 'year':
			objectName += `${formatDate(now, 'YYYY')}/`;
			break;
		case 'yearmonth':
			objectName += `${formatDate(now, 'YYYY/MM')}/`;
			break;
		case 'date':
			objectName += `${formatDate(now, 'YYYY/MM/DD')}/`;
			break;
		case 'typeAndData':
			objectName += `${getFileTypeFromMime(options.file)}/${formatDate(now, 'YYYY/MM/DD')}/`;
			break;
		default:
	}

	switch (options.nameRule) {
		case 'local':
			objectName += options.file.name;
			break;
		case 'time':
			objectName += formatDate(now, 'YYYYMMDDHHmmSS') + getExtension(options.file.name);
			break;
		case 'timeAndLocal':
			objectName += formatDate(now, 'YYYYMMDDHHmmSS') + '_' + options.file.name;
			break;
		default:
	}

	return objectName;
}

function normalizeFolder(folder?: string): string {
	const normalized = (folder || '').replace(/^\/+|\/+$/g, '');
	return normalized ? `${normalized}/` : '';
}

function getExtension(fileName: string): string {
	return fileName.substring(fileName.lastIndexOf('.'));
}

function formatDate(date: Date, format: string): string {
	const parts: Record<string, string> = {
		YYYY: String(date.getFullYear()),
		MM: pad2(date.getMonth() + 1),
		DD: pad2(date.getDate()),
		HH: pad2(date.getHours()),
		mm: pad2(date.getMinutes()),
		SS: pad2(Math.floor(date.getMilliseconds() / 10)),
	};

	return format.replace(/YYYY|MM|DD|HH|mm|SS/g, part => parts[part]);
}

function pad2(value: number): string {
	return String(value).padStart(2, '0');
}
