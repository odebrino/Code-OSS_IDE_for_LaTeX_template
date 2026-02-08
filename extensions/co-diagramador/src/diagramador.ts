/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type DiagramadorDocument = {
	title: string;
	model: string;
	text: string;
	members: string[];
	keywords: string[];
	taskNumber?: string;
	divulgDate?: string;
	divulgTime?: string;
	divulgLocal?: string;
	cumprDate?: string;
	cumprTime?: string;
	cumprLocal?: string;
	nextDate?: string;
	nextTime?: string;
	nextLocal?: string;
	taskBodyHeight?: string;
};

export type DiagramadorProject = {
	templateId: string;
	doc: DiagramadorDocument;
};

export const DEFAULT_TEMPLATE_ID = 'test_v0';

export const TEMPLATE_TEST_V0 = String.raw`\documentclass[12pt]{article}

% ========= Pagina =========
\usepackage[a4paper,left=3cm,right=3cm,top=0.75cm,bottom=2.5cm]{geometry}
\usepackage[brazil]{babel}
\usepackage{graphicx}
\usepackage{tabularx}
\usepackage{array}
\usepackage[most]{tcolorbox}
\usepackage{iftex}

\pagestyle{empty}
\setlength{\parindent}{0pt}
\setlength{\parskip}{6pt}

% ========= Fonte (depois do titulo) =========
\ifPDFTeX
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
% fallback (pdfLaTeX): nao e Comic Sans real
\newcommand{\comic}{\sffamily}
\else
\usepackage{fontspec}
% XeLaTeX/LuaLaTeX: se tiver Comic Sans MS instalada (ou se voce subir a .ttf), usa ela
\IfFontExistsTF{Comic Sans MS}
{\newfontfamily\comicfont{Comic Sans MS}\newcommand{\comic}{\comicfont}}
{\IfFontExistsTF{Latin Modern Sans}
{\newfontfamily\comicfont{Latin Modern Sans}\newcommand{\comic}{\comicfont}}
{\newcommand{\comic}{\sffamily}}}
\fi

% ========= Variaveis =========
\newcommand{\HeaderImage}{assets/modelo_header_image1.jpg}
\newcommand{\TaskNumber}{XX}

\newcommand{\DivulgDate}{00/04/2020}
\newcommand{\DivulgTime}{As 00h00min}
\newcommand{\DivulgLocal}{Q.G. da C.O.}

\newcommand{\CumprDate}{00/04/2020}
\newcommand{\CumprTime}{Ate as 00h00min}
\newcommand{\CumprLocal}{Q.G. da C.O.}

\newcommand{\NextDate}{00/04/2020}
\newcommand{\NextTime}{As 00h00min}
\newcommand{\NextLocal}{Q.G. da C.O.}

\newcommand{\TaskBodyHeight}{6cm} % altura do 1o retangulo vazio
\newcommand{\TaskBody}{}

% ========= Molduras =========
\newtcolorbox{FrameBox}[1][]{%
enhanced,
sharp corners,
colback=white,
colframe=black,
boxrule=0.8pt,
left=4mm,right=4mm,top=3mm,bottom=3mm,
#1
}

% ========= Helpers =========
\newcommand{\InfoRow}[3]{%
\begin{tabular*}{\textwidth}{@{}p{0.32\textwidth}p{0.28\textwidth}p{0.40\textwidth}@{}}
\textbf{Data:} #1 & \textbf{Hora:} #2 & \textbf{Local:} #3
\end{tabular*}\par
}

\begin{document}

% ========= Cabecalho (imagem) =========
\begin{center}
\includegraphics[width=\textwidth]{\HeaderImage}
\end{center}
\vspace{0.35cm}

% ========= Titulo =========
\begin{center}
{\LARGE\bfseries Tarefa \TaskNumber}
\end{center}

% ======== A PARTIR DAQUI: Comic Sans (ou fallback) ========
\comic

% ========= Divulgacao =========
\textbf{Divulgacao:}\par
\InfoRow{\DivulgDate}{\DivulgTime}{\DivulgLocal}

% 1o retangulo (vazio)
\begin{FrameBox}[height=\TaskBodyHeight, valign=top]
\TaskBody
\end{FrameBox}

\vspace{0.6cm}

% ========= Cumprimento =========
\textbf{Cumprimento:}\par
\InfoRow{\CumprDate}{\CumprTime}{\CumprLocal}

\textbf{Criterio de avaliacao:}\par
-\par

\textbf{Pontuacao:}\par
-\par

\vspace{0.8cm}

% ========= Proxima tarefa =========
\textbf{Divulgacao da proxima tarefa:}\par
\InfoRow{\NextDate}{\NextTime}{\NextLocal}

\vspace{0.8cm}

% ========= Patrocinadores =========
\textbf{PATROCINADORES:}\par

% 2o retangulo (lista dentro, organizado)
\begin{FrameBox}
\begin{center}\small
\renewcommand{\arraystretch}{1.25}

% Linha de cima (3 colunas, cada uma com 2 linhas)
\begin{tabularx}{\textwidth}{@{}>{\centering\arraybackslash}X>{\centering\arraybackslash}X>{\centering\arraybackslash}X@{}}

\end{tabularx}

\vspace{0.6em}

% Linha de baixo (6 colunas)
\begin{tabularx}{\textwidth}{@{}*{6}{>{\centering\arraybackslash}X}@{}}

\end{tabularx}

\end{center}
\end{FrameBox}

\vspace{0.8cm}

% ========= Alimento =========
\textbf{ALIMENTO}\par

\end{document}`;

export function createDefaultProject(): DiagramadorProject {
	return {
		templateId: DEFAULT_TEMPLATE_ID,
		doc: {
			title: '',
			model: '',
			text: '',
			members: [],
			keywords: []
		}
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

	const templateId = typeof data.templateId === 'string' && data.templateId.trim()
		? data.templateId.trim()
		: fallback.templateId;

	const docData = data.doc && typeof data.doc === 'object' ? data.doc : {};
	const doc: DiagramadorDocument = {
		title: normalizeString(docData.title),
		model: normalizeString(docData.model),
		text: normalizeString(docData.text),
		members: normalizeStringArray(docData.members),
		keywords: normalizeStringArray(docData.keywords),
		taskNumber: normalizeOptionalString(docData.taskNumber),
		divulgDate: normalizeOptionalString(docData.divulgDate),
		divulgTime: normalizeOptionalString(docData.divulgTime),
		divulgLocal: normalizeOptionalString(docData.divulgLocal),
		cumprDate: normalizeOptionalString(docData.cumprDate),
		cumprTime: normalizeOptionalString(docData.cumprTime),
		cumprLocal: normalizeOptionalString(docData.cumprLocal),
		nextDate: normalizeOptionalString(docData.nextDate),
		nextTime: normalizeOptionalString(docData.nextTime),
		nextLocal: normalizeOptionalString(docData.nextLocal),
		taskBodyHeight: normalizeOptionalString(docData.taskBodyHeight)
	};

	return {
		templateId,
		doc
	};
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

export function createTemplateData(project: DiagramadorProject): Record<string, string> {
	const doc = project.doc ?? createDefaultProject().doc;
	const defaults = {
		taskNumber: 'XX',
		divulgDate: '00/04/2020',
		divulgTime: 'As 00h00min',
		divulgLocal: 'Q.G. da C.O.',
		cumprDate: '00/04/2020',
		cumprTime: 'Ate as 00h00min',
		cumprLocal: 'Q.G. da C.O.',
		nextDate: '00/04/2020',
		nextTime: 'As 00h00min',
		nextLocal: 'Q.G. da C.O.',
		taskBodyHeight: '6cm'
	};

	const taskNumberSource = pickFirstNonEmpty(
		normalizeString(doc.taskNumber),
		normalizeString(doc.title),
		normalizeString(doc.model),
		defaults.taskNumber
	);

	return {
		TaskNumber: taskNumberSource,
		DivulgDate: pickFirstNonEmpty(normalizeString(doc.divulgDate), defaults.divulgDate),
		DivulgTime: pickFirstNonEmpty(normalizeString(doc.divulgTime), defaults.divulgTime),
		DivulgLocal: pickFirstNonEmpty(normalizeString(doc.divulgLocal), defaults.divulgLocal),
		CumprDate: pickFirstNonEmpty(normalizeString(doc.cumprDate), defaults.cumprDate),
		CumprTime: pickFirstNonEmpty(normalizeString(doc.cumprTime), defaults.cumprTime),
		CumprLocal: pickFirstNonEmpty(normalizeString(doc.cumprLocal), defaults.cumprLocal),
		NextDate: pickFirstNonEmpty(normalizeString(doc.nextDate), defaults.nextDate),
		NextTime: pickFirstNonEmpty(normalizeString(doc.nextTime), defaults.nextTime),
		NextLocal: pickFirstNonEmpty(normalizeString(doc.nextLocal), defaults.nextLocal),
		TaskBodyHeight: sanitizeLatexLength(normalizeString(doc.taskBodyHeight), defaults.taskBodyHeight),
		TaskBody: normalizeString(doc.text)
	};
}

export function renderLatex(project: DiagramadorProject): string {
	const data = createTemplateData(project);
	const values = {
		TaskNumber: escapeLatex(data.TaskNumber),
		DivulgDate: escapeLatex(data.DivulgDate),
		DivulgTime: escapeLatex(data.DivulgTime),
		DivulgLocal: escapeLatex(data.DivulgLocal),
		CumprDate: escapeLatex(data.CumprDate),
		CumprTime: escapeLatex(data.CumprTime),
		CumprLocal: escapeLatex(data.CumprLocal),
		NextDate: escapeLatex(data.NextDate),
		NextTime: escapeLatex(data.NextTime),
		NextLocal: escapeLatex(data.NextLocal),
		TaskBodyHeight: sanitizeLatexLength(normalizeString(data.TaskBodyHeight), '6cm'),
		TaskBody: escapeLatexBlock(normalizeString(data.TaskBody))
	};

	let output = TEMPLATE_TEST_V0;
	output = replaceNewCommand(output, 'TaskNumber', values.TaskNumber);
	output = replaceNewCommand(output, 'DivulgDate', values.DivulgDate);
	output = replaceNewCommand(output, 'DivulgTime', values.DivulgTime);
	output = replaceNewCommand(output, 'DivulgLocal', values.DivulgLocal);
	output = replaceNewCommand(output, 'CumprDate', values.CumprDate);
	output = replaceNewCommand(output, 'CumprTime', values.CumprTime);
	output = replaceNewCommand(output, 'CumprLocal', values.CumprLocal);
	output = replaceNewCommand(output, 'NextDate', values.NextDate);
	output = replaceNewCommand(output, 'NextTime', values.NextTime);
	output = replaceNewCommand(output, 'NextLocal', values.NextLocal);
	output = replaceNewCommand(output, 'TaskBodyHeight', values.TaskBodyHeight);
	output = replaceNewCommand(output, 'TaskBody', values.TaskBody);

	return output;
}

function normalizeString(value: any): string {
	if (value === null || value === undefined) {
		return '';
	}
	return typeof value === 'string' ? value : String(value);
}

function normalizeOptionalString(value: any): string | undefined {
	if (value === null || value === undefined) {
		return undefined;
	}
	return typeof value === 'string' ? value : String(value);
}

function normalizeStringArray(value: any): string[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.map(entry => normalizeString(entry));
}

function pickFirstNonEmpty(...values: string[]): string {
	for (const value of values) {
		const trimmed = value.trim();
		if (trimmed) {
			return trimmed;
		}
	}
	return '';
}

function sanitizeLatexLength(value: string, fallback: string): string {
	const trimmed = value.trim();
	if (!trimmed) {
		return fallback;
	}
	const match = trimmed.match(/^\d+(?:\.\d+)?\s*(cm|mm|in|pt|em|ex)$/);
	if (!match) {
		return fallback;
	}
	return trimmed.replace(/\s+/g, '');
}

function replaceNewCommand(source: string, name: string, value: string): string {
	const pattern = new RegExp(`\\\\newcommand\\{\\\\${name}\\}\\{[^}]*\\}`, 'g');
	return source.replace(pattern, `\\newcommand{\\${name}}{${value}}`);
}
