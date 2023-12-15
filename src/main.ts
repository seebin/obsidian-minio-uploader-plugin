import { App, Editor, EditorPosition, Notice, Plugin, PluginSettingTab, Setting, TextComponent, setIcon } from 'obsidian';
import { Client } from 'minio-es';
import { moment } from 'obsidian';
import mime from 'mime';
import { t } from './i18n';

interface MinioPluginSettings {
	accessKey: string;
	secretKey: string;
	region: string;
	bucket: string;
	endpoint: string;
	port: number;
	useSSL: boolean;
	imgPreview: boolean;
	videoPreview: boolean;
	audioPreview: boolean;
	docsPreview: string;
	nameRule: string;
	pathRule: string;
}

const DEFAULT_SETTINGS: MinioPluginSettings = {
	accessKey: '',
	secretKey: '',
	region: '',
	endpoint: '',
	port: 443,
	bucket: '',
	useSSL: true,
	imgPreview: true,
	videoPreview: true,
	audioPreview: true,
	docsPreview: '',
	nameRule: 'local',
	pathRule: 'root',
}

export default class MinioUploaderPlugin extends Plugin {
	settings: MinioPluginSettings;

	async onload() {
		await this.loadSettings();

		// This adds a simple command that can be triggered anywhere
		// this.addCommand({
		// 	id: 'open-sample-modal-simple',
		// 	name: 'Open sample modal (simple)',
		// 	callback: () => {
		// 		new SampleModal(this.app).open();
		// 	}
		// });
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'minio-uploader',
			name: t('File upload'),
			icon: 'upload-cloud',
			editorCallback: (editor: Editor) => {
				const input = document.createElement('input')
				input.setAttribute('type', 'file')
				input.setAttribute('accept', 'image/*,video/*,.doc,.docx,.pdf,.pptx,.xlsx,.xls')
				input.onchange = async (event: Event) => {
					const file = (event.target as any)?.files[0]

					const { endpoint, port, useSSL, bucket } = this.settings
					const host = `http${useSSL ? 's' : ''}://${endpoint}${port === 443 || port === 80 ? '' : ':' + port}`
					const pathName = `${file.name}`
					let replaceText = `[${t('Uploading')}：0%](${pathName})\n`;
					editor.replaceSelection(replaceText);

					await this.minioUploader(file, pathName, (process) => {
						const replaceText2 = `[${t('Uploading')}：${process}%](${pathName})`;
						this.replaceText(editor, replaceText, replaceText2)
						replaceText = replaceText2
					})
					const url = `${host}/${bucket}/${pathName}`
					this.replaceText(editor, replaceText, this.wrapFileDependingOnType(this.getFileType(file), url, file.name))
				}
				input.click()
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new MinioSettingTab(this.app, this));

		this.registerEvent(
			this.app.workspace.on("editor-paste", this.handleUploader.bind(this))
		);
		this.registerEvent(
			this.app.workspace.on("editor-drop", this.handleUploader.bind(this))
		);
	}

	getFileType(file: File) {
		const imageType = /image.*/;
		const videoType = /video.*/;
		const audioType = /audio.*/;
		const docType = /application\/(vnd.*|pdf)/;

		if (file?.type.match(videoType)) {
			return "video";
		} else if (file?.type.match(audioType)) {
			return "audio";
		} else if (file?.type.match(docType)) {
			return "doc";
		} else if (file?.type.match(imageType)) {
			return "image";
		} else {
			return ''
		}
	}

	async handleUploader(evt: ClipboardEvent | DragEvent, editor: Editor): Promise<void> {
		if (evt.defaultPrevented) {
			return;
		}
		let file = null;

		// figure out what kind of event we're handling
		switch (evt.type) {
			case "paste":
				file = (evt as ClipboardEvent).clipboardData?.files[0];
				break;
			case "drop":
				file = (evt as DragEvent).dataTransfer?.files[0];
		}

		if (!file || file && !this.getFileType(file)) return;

		evt.preventDefault();
		const { endpoint, port, useSSL, bucket } = this.settings
		const host = `http${useSSL ? 's' : ''}://${endpoint}${port === 443 || port === 80 ? '' : ':' + port}`
		let pathName = `${file.name}`
		let replaceText = `[${t('Uploading')}：0%](${pathName})\n`;
		editor.replaceSelection(replaceText);

		pathName = await this.minioUploader(file, pathName, (process) => {
			const replaceText2 = `[${t('Uploading')}：${process}%](${pathName})`;
			this.replaceText(editor, replaceText, replaceText2)
			replaceText = replaceText2
		})
		const url = `${host}/${bucket}/${pathName}`
		this.replaceText(editor, replaceText, this.wrapFileDependingOnType(this.getFileType(file), url, file.name))
	}

	minioUploader(file: File, fileName: string, progress?: (count: number) => void): Promise<string> {
		return new Promise((resolve, reject) => {
			try {
				const minioClient = new Client({
					endPoint: this.settings.endpoint,
					port: this.settings.port,
					useSSL: this.settings.useSSL,
					region: this.settings.region,
					accessKey: this.settings.accessKey,
					secretKey: this.settings.secretKey
				})
				let objectName = ''
				switch (this.settings.pathRule) {
					case 'root':
						objectName = ''
						break;
					case 'type':
						objectName = `${this.getFileType(file)}/`
						break;
					case 'date':
						objectName = `${moment().format('YYYY/MM/DD')}/`
						break;
					case 'typeAndData':
						objectName = `${this.getFileType(file)}/${moment().format('YYYY/MM/DD')}/`
						break;
					default:
				}
				switch (this.settings.nameRule) {
					case 'local':
						objectName += fileName
						break;
					case 'time':
						objectName += `${new Date().getTime()}_${fileName}`
						break;
					default:
				}

				minioClient.presignedPutObject(this.settings.bucket, objectName, 1 * 60 * 60).then(presignedUrl => {
					const xhr = new XMLHttpRequest();
					xhr.upload.addEventListener("progress", (progressEvent) => {
						if (progress) progress(Math.round((progressEvent.loaded / progressEvent.total) * 100))
					}, false)
					xhr.onreadystatechange = function () {
						if (xhr.readyState === 4) {
							if (xhr.status === 200) {
								resolve(objectName)
							} else {
								console.error('xhr', xhr)
								reject(xhr.status)
								new Notice('Error: upload failed.' + xhr.status);
							}
						}
					};
					xhr.open("PUT", presignedUrl, true);
					const va = mime.getType(objectName.substring(objectName.lastIndexOf('.'))) as string
					xhr.setRequestHeader('Content-Type', va);

					xhr.send(file);
				}).catch(err => {
					reject(err)
					new Notice('Error: upload failed.' + err.message);
				})
			} catch (err) {
				new Notice('Error: ' + err.message);
			}
		})
	}

	private replaceText(
		editor: Editor,
		target: string,
		replacement: string
	): void {
		target = target.trim();
		const lines = editor.getValue().split("\n");
		for (let i = 0; i < lines.length; i++) {
			const ch = lines[i].indexOf(target);
			if (ch !== -1) {
				const from = { line: i, ch: ch } as EditorPosition;
				const to = {
					line: i,
					ch: ch + target.length,
				} as EditorPosition;
				editor.setCursor(from);
				editor.replaceRange(replacement, from, to);
				to.ch = ch + replacement.length;
				editor.setCursor(to);
				break;
			}
		}
	}

	wrapFileDependingOnType(type: string, url: string, name: string) {
		if (type === 'image') {
			return `${this.settings.imgPreview ? '!' : ''}[${name}](${url})\n`
		} else if (type === 'video') {
			return `${this.settings.videoPreview ? `<video src="${url}" controls></video>` : `[${name}](${url})`}\n`;
		} else if (type === 'audio') {
			return `${this.settings.audioPreview ? `<audio src="${url}" controls></audio>` : `[${name}](${url})`}\n`;
		} else if (type === 'doc') {
			return `\n${this.settings.docsPreview ? `<iframe frameborder=0 border=0 width=100% height=800
			src="${this.settings.docsPreview}${url}">
		</iframe>` : `[${name}](${url})`}\n`
		} else {
			throw new Error('Unknown file type');
		}
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

// class SampleModal extends Modal {
// 	constructor(app: App) {
// 		super(app);
// 	}

// 	onOpen() {
// 		const { contentEl } = this;
// 		contentEl.setText('Woah!');
// 	}

// 	onClose() {
// 		const { contentEl } = this;
// 		contentEl.empty();
// 	}
// }

const wrapTextWithPasswordHide = (text: TextComponent) => {
	const hider = text.inputEl.insertAdjacentElement("beforebegin", createSpan());
	if (!hider) {
		return
	}
	setIcon(hider as HTMLElement, 'eye-off');

	hider.addEventListener("click", () => {
		const isText = text.inputEl.getAttribute("type") === "text";
		if (isText) {
			setIcon(hider as HTMLElement, 'eye-off');
			text.inputEl.setAttribute("type", "password");
		} else {
			setIcon(hider as HTMLElement, 'eye')
			text.inputEl.setAttribute("type", "text");
		}
		text.inputEl.focus();
	});
	text.inputEl.setAttribute("type", "password");
	return text;
};

class MinioSettingTab extends PluginSettingTab {
	plugin: MinioUploaderPlugin;

	constructor(app: App, plugin: MinioUploaderPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Access key')
			.setDesc(t('Required'))
			.addText(text => {
				wrapTextWithPasswordHide(text);
				text.setPlaceholder(t('Enter your access key'))
					.setValue(this.plugin.settings.accessKey)
					.onChange(async (value) => {
						this.plugin.settings.accessKey = value;
						await this.plugin.saveSettings();
					})
			});
		new Setting(containerEl)
			.setName('Secret key')
			.setDesc(t('Required'))
			.addText(text => {
				wrapTextWithPasswordHide(text);
				text.setPlaceholder(t('Enter your secret key'))
					.setValue(this.plugin.settings.secretKey)
					.onChange(async (value) => {
						this.plugin.settings.secretKey = value;
						await this.plugin.saveSettings();
					})
			});
		new Setting(containerEl)
			.setName('Region')
			.setDesc(t('Optional'))
			.addText(text => text
				.setPlaceholder(t('Enter your region'))
				.setValue(this.plugin.settings.region)
				.onChange(async (value) => {
					this.plugin.settings.region = value;
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName('Bucket')
			.setDesc(t('Required'))
			.addText(text => text
				.setPlaceholder(t('Enter your bucket'))
				.setValue(this.plugin.settings.bucket)
				.onChange(async (value) => {
					this.plugin.settings.bucket = value;
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName('Endpoint')
			.setDesc(t('Required'))
			.addText(text => text
				.setPlaceholder('minio.xxxx.cn')
				.setValue(this.plugin.settings.endpoint)
				.onChange(async (value) => {
					this.plugin.settings.endpoint = value;
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName('Port')
			.setDesc(t('Required'))
			.addText(text => text
				.setPlaceholder(t('Enter your port'))
				.setValue(this.plugin.settings.port + '')
				.onChange(async (value) => {
					this.plugin.settings.port = parseInt(value);
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName('SSL')
			.addToggle(text => text
				.setValue(this.plugin.settings.useSSL)
				.onChange(async (value) => {
					this.plugin.settings.useSSL = value;
					await this.plugin.saveSettings();
				}));
		containerEl.createEl("h3", { text: t("Object rules") });
		containerEl.createEl("br");
		new Setting(containerEl)
			.setName(t('Object naming rules'))
			.setDesc(t('Naming rules description'))
			.addDropdown((select) => select
				.addOption('local', t('Local file name'))
				.addOption('time', t('Time stamp name'))
				.setValue(this.plugin.settings.nameRule)
				.onChange(async value => {
					this.plugin.settings.nameRule = value;
					await this.plugin.saveSettings();
				}))
		new Setting(containerEl)
			.setName(t('Object path rules'))
			.setDesc(t('Object path rules description'))
			.addDropdown((select) => select
				.addOption('root', t('Root directory'))
				.addOption('type', t('File type directory'))
				.addOption('date', t('Date directory'))
				.addOption('typeAndData', t('File type and date directory'))
				.setValue(this.plugin.settings.pathRule)
				.onChange(async value => {
					this.plugin.settings.pathRule = value;
					await this.plugin.saveSettings();
				}))

		containerEl.createEl("h3", { text: t("Preview") });
		containerEl.createEl("br");
		new Setting(containerEl)
			.setName(t('Image preview'))
			.setDesc(t('Image preview description'))
			.addToggle(text => text
				.setValue(this.plugin.settings.imgPreview)
				.onChange(async (value) => {
					this.plugin.settings.imgPreview = value;
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName(t('Video preview'))
			.setDesc(t('Video preview description'))
			.addToggle(text => text
				.setValue(this.plugin.settings.videoPreview)
				.onChange(async (value) => {
					this.plugin.settings.videoPreview = value;
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName(t('Audio preview'))
			.setDesc(t('Audio preview description'))
			.addToggle(text => text
				.setValue(this.plugin.settings.audioPreview)
				.onChange(async (value) => {
					this.plugin.settings.audioPreview = value;
					await this.plugin.saveSettings();
				}));
		new Setting(containerEl)
			.setName(t('Docs preview'))
			.setDesc(t('Docs preview description'))
			.addDropdown((select) => select
				.addOption('', t('Disabled'))
				.addOption('https://docs.google.com/viewer?url=', t('Google docs'))
				.addOption('https://view.officeapps.live.com/op/view.aspx?src=', t('Office online'))
				.setValue(this.plugin.settings.docsPreview)
				.onChange(async value => {
					this.plugin.settings.docsPreview = value;
					await this.plugin.saveSettings();
				}))
	}
}
