export const parseText = (children) => {
	let content = ''

	for (let child of children) {
		switch (child.type) {
			case 'text':
				content += child.value
				break
			case 'paragraph':
				content += parseText(child.children)
				break
			case 'heading':
				content += parseText(child.children)
				break
			case 'strong':
				content += `<b>${parseText(child.children)}</b>`
				break
			case 'emphasis':
				content += `<i>${parseText(child.children)}</i>`
				break
			case 'link':
				content += `<a href="${child.url}">${parseText(child.children)}</a>`
				break
		}
	}

	return content
}

export const parseItems = (children) => {
	let list = []

	for (let child of children) {
		list.push(parseText(child.children))
	}

	return list
}

export const parseTable = (children) => {
	let table = []

	for (let row of children) {
		let tableRow = []
		for (let cell of row.children) {
			tableRow.push(parseText(cell.children))
		}
		table.push(tableRow)
	}

	return table
}
