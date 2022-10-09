import axios from 'axios'
import fs from 'fs/promises'
import core from '@actions/core'
import { unified } from 'unified'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'

import { parseItems, parseText, parseTable } from './parsers.js'

const readFile = async (path) => {
	try {
		await fs.access(path)
	} catch (ex) {
		throw new Error(`${path} is missing!`)
	}

	try {
		return (await fs.readFile(path)).toString()
	} catch (ex) {
		throw new Error(`${path} file cannot be read!`)
	}
}

const convertToBlocks = (markdown) => {
	const blocks = []

	for (let child of markdown.children) {
		switch (child.type) {
			case 'paragraph':
				if (child.children[0].type === 'image') {
					blocks.push({
						type: 'image',
						data: {
							file: {
								url: child.children[0].url,
							},
							stretched: false,
							withBackground: false,
							withBorder: false,
						},
					})
				} else {
					blocks.push({ type: 'paragraph', data: { text: parseText(child.children) } })
				}
				break
			case 'heading':
				blocks.push({ type: 'header', data: { text: parseText(child.children), level: child.depth } })
				break
			case 'code':
				blocks.push({ type: 'code', data: { code: child.value } })
				break
			case 'list':
				blocks.push({
					type: 'list',
					data: { style: child.ordered ? 'ordered' : 'unordered', items: parseItems(child.children) },
				})
				break
			case 'table':
				blocks.push({
					type: 'table',
					data: { content: parseTable(child.children) },
				})
				break
		}
	}

	return blocks
}

const groupByArticle = (blocks) => {
	const articles = blocks[0].type !== 'header' ? [{ type: 'article', data: { text: 'Overview' } }] : []

	for (let block of blocks) {
		if (block.type === 'header' && block.data.level <= 2) {
			articles.push({ type: 'article', data: { text: block.data.text } })
		} else {
			const article = articles[articles.length - 1]
			article.blocks ??= []

			article.blocks.push(block)
		}
	}

	return articles
}

const uploadToNotice = async (articles) => {
	const bms = axios.create({
		baseURL: 'https://bms.notice.studio',
		headers: {
			'api-key': process.env.API_KEY,
		},
	})

	const {
		data: { data: project },
	} = await bms.get(`/blocks/${process.env.PROJECT_ID}`)

	for (let child of project.children) {
		await bms.delete(`/blocks/${child}`)
	}

	const {
		data: { data: section },
	} = await bms.post('/blocks', { type: 'section', data: { text: 'Documentation' }, parentId: project._id })

	for (let article of articles) {
		const { data } = await bms.post('/blocks', {
			type: article.type,
			data: article.data,
			parentId: section._id,
		})

		await bms.put(`/blocks/${data.data._id}/blocks`, {
			blocks: article.blocks,
		})
	}
}

try {
	if (!process.env.API_KEY) throw new Error('No API_KEY!')
	if (!process.env.PROJECT_ID) throw new Error('No PROJECT_ID!')

	core.notice('Reading README.md')
	const content = await readFile('README.md')

	core.notice('Parsing markdown')
	const markdown = unified().use(remarkParse).use(remarkGfm).parse(content)

	core.notice('Convert markdown to blocks')
	const blocks = convertToBlocks(markdown)

	core.notice('Group blocks by article')
	const articles = groupByArticle(blocks)

	core.notice('Upload blocks to Notice')
	await uploadToNotice(articles)
} catch (ex) {
	core.setFailed(ex.message)
}
