/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import crypto from 'crypto';

export type DiagramadorBlockType = 'title' | 'text' | 'question' | 'image' | 'section';

export type DiagramadorHeader = {
	name: string;
	turma: string;
	disciplina: string;
	professor: string;
	date: string;
};

export type DiagramadorBlock =
	| { id: string; type: 'title'; text: string }
	| { id: string; type: 'text'; text: string }
	| { id: string; type: 'section'; title: string }
	| { id: string; type: 'question'; statement: string; lines: number }
	| { id: string; type: 'image'; asset?: string; caption?: string };

export type DiagramadorProject = {
	meta: {
		createdAt: string;
		version: number;
	};
	header: DiagramadorHeader;
	blocks: DiagramadorBlock[];
};

export function createDefaultProject(): DiagramadorProject {
	return {
		meta: {
			createdAt: new Date().toISOString(),
			version: 1
		},
		header: {
			name: '',
			turma: '',
			disciplina: '',
			professor: '',
			date: ''
		},
		blocks: []
	};
}

export function serializeProject(project: DiagramadorProject): string {
	return JSON.stringify(project, null, 2);
}

export function parseProject(raw: string): DiagramadorProject | null {
	try {
		const data = JSON.parse(raw);
		return normalizeProject(data);
	} catch {
		return null;
	}
}

export function normalizeProject(data: any): DiagramadorProject {
	const fallback = createDefaultProject();
	if (!data || typeof data !== 'object') {
		return fallback;
	}

	const header = typeof data.header === 'object' && data.header
		? {
			name: String(data.header.name ?? ''),
			turma: String(data.header.turma ?? ''),
			disciplina: String(data.header.disciplina ?? ''),
			professor: String(data.header.professor ?? ''),
			date: String(data.header.date ?? '')
		}
		: fallback.header;

	const meta = typeof data.meta === 'object' && data.meta
		? {
			createdAt: String(data.meta.createdAt ?? fallback.meta.createdAt),
			version: Number(data.meta.version ?? fallback.meta.version)
		}
		: fallback.meta;

	const blocks: DiagramadorBlock[] = Array.isArray(data.blocks)
		? data.blocks
			.map((block: any) => normalizeBlock(block))
			.filter((block: DiagramadorBlock | null): block is DiagramadorBlock => Boolean(block))
		: [];

	return {
		meta,
		header,
		blocks
	};
}

export function createBlock(type: DiagramadorBlockType): DiagramadorBlock {
	const id = crypto.randomBytes(8).toString('hex');
	switch (type) {
		case 'title':
			return { id, type, text: '' };
		case 'text':
			return { id, type, text: '' };
		case 'section':
			return { id, type, title: '' };
		case 'question':
			return { id, type, statement: '', lines: 4 };
		case 'image':
			return { id, type, asset: undefined, caption: '' };
		default:
			return { id, type: 'text', text: '' };
	}
}

function normalizeBlock(block: any): DiagramadorBlock | null {
	if (!block || typeof block !== 'object') {
		return null;
	}
	const id = typeof block.id === 'string' && block.id ? block.id : crypto.randomBytes(8).toString('hex');
	const type = String(block.type ?? '');
	switch (type) {
		case 'title':
			return { id, type, text: String(block.text ?? '') };
		case 'text':
			return { id, type, text: String(block.text ?? '') };
		case 'section':
			return { id, type, title: String(block.title ?? '') };
		case 'question':
			return { id, type, statement: String(block.statement ?? ''), lines: Math.max(1, Number(block.lines ?? 4)) };
		case 'image':
			return { id, type, asset: block.asset ? String(block.asset) : undefined, caption: String(block.caption ?? '') };
		default:
			return null;
	}
}

export function escapeLatex(value: string): string {
	const map: Record<string, string> = {
		'\\': '\\textbackslash{}',
		'{': '\\{',
		'}': '\\}',
		'%': '\\%',
		'$': '\\$',
		'#': '\\#',
		'&': '\\&',
		'_': '\\_',
		'^': '\\textasciicircum{}',
		'~': '\\textasciitilde{}'
	};
	return value.replace(/[\\{}%$#&_~^]/g, match => map[match]);
}

export function escapeLatexBlock(value: string): string {
	const escaped = escapeLatex(value);
	return escaped.replace(/\r?\n/g, '\\\\');
}

export function renderLatex(project: DiagramadorProject): string {
	const header = project.header;
	const name = escapeLatex(header.name || 'Aluno');
	const turma = escapeLatex(header.turma || 'Turma');
	const disciplina = escapeLatex(header.disciplina || 'Disciplina');
	const professor = escapeLatex(header.professor || '-');
	const date = escapeLatex(header.date || '-');

	const blocks = project.blocks
		.map(block => renderBlock(block))
		.filter(Boolean)
		.join('\n\n');

	return [
		'\\documentclass[12pt]{article}',
		'\\usepackage[utf8]{inputenc}',
		'\\usepackage{geometry}',
		'\\usepackage{graphicx}',
		'\\usepackage{parskip}',
		'\\geometry{a4paper, margin=2.5cm}',
		'\\graphicspath{{../assets/}}',
		'\\begin{document}',
		'\\begin{center}',
		'{\\Large Diagramador}',
		'\\end{center}',
		'\\vspace{0.6cm}',
		'\\begin{tabular}{ll}',
		`Nome: & ${name} \\\\`,
		`Turma: & ${turma} \\\\`,
		`Disciplina: & ${disciplina} \\\\`,
		`Professor: & ${professor} \\\\`,
		`Data: & ${date} \\\\`,
		'\\end{tabular}',
		'\\vspace{0.8cm}',
		blocks || '\\\\',
		'\\end{document}'
	].join('\n');
}

function renderBlock(block: DiagramadorBlock): string {
	switch (block.type) {
		case 'title': {
			const text = escapeLatex(block.text || '');
			if (!text.trim()) {
				return '';
			}
			return `\\section*{${text}}`;
		}
		case 'section': {
			const text = escapeLatex(block.title || '');
			if (!text.trim()) {
				return '';
			}
			return `\\subsection*{${text}}`;
		}
		case 'text': {
			const text = escapeLatexBlock(block.text || '');
			return text.trim() ? text : '';
		}
		case 'question': {
			const statement = escapeLatexBlock(block.statement || '');
			const lines = Math.max(1, block.lines || 1);
			const lineBlocks = Array.from({ length: lines }).map(() => '\\\\[0.35cm]\\rule{\\linewidth}{0.4pt}').join('');
			return [
				statement ? `\\textbf{Questao} ${statement}` : '\\textbf{Questao}',
				lineBlocks
			].join('\n');
		}
		case 'image': {
			if (!block.asset) {
				return '';
			}
			const caption = escapeLatex(block.caption || '');
			const captionLine = caption.trim() ? `\\\\\\small ${caption}` : '';
			return [
				'\\begin{center}',
				`\\includegraphics[width=0.8\\textwidth]{${escapeLatex(block.asset)}}${captionLine}`,
				'\\end{center}'
			].join('\n');
		}
		default:
			return '';
	}
}
