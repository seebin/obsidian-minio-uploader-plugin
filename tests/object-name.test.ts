import assert from 'node:assert/strict';
import { buildObjectName } from '../src/object-name';

const file = {
	name: 'image.png',
	type: 'image/png',
};

const now = new Date('2026-05-20T03:04:05.000Z');

{
	assert.equal(
		buildObjectName({
			file,
			folder: '/notes/assets/',
			pathRule: 'year',
			nameRule: 'local',
			now,
		}),
		'notes/assets/2026/image.png'
	);
}

{
	assert.equal(
		buildObjectName({
			file,
			folder: 'notes/assets',
			pathRule: 'yearmonth',
			nameRule: 'local',
			now,
		}),
		'notes/assets/2026/05/image.png'
	);
}

{
	assert.equal(
		buildObjectName({
			file,
			folder: 'notes/assets',
			pathRule: 'date',
			nameRule: 'local',
			now,
		}),
		'notes/assets/2026/05/20/image.png'
	);
}
