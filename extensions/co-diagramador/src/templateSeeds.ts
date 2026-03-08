/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { TemplateManifest } from 'co-template-core';
import { DEFAULT_TASK_TYPE } from './diagramador';

export type DiagramadorSeedTemplate = {
	manifest: TemplateManifest;
	mainTex: string;
	previewData: Record<string, unknown>;
};

function cloneDefaults(value: Record<string, unknown>): Record<string, unknown> {
	return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

const TAREFA_MANIFEST: TemplateManifest = {
	id: 'tarefa',
	name: 'Tarefa',
	version: '1.0.0',
	description: 'Modelo padrao para tarefas do diagramador.',
	entry: 'main.tex',
	schema: [
		{ key: 'texto', type: 'latex', label: 'Texto' },
		{ key: 'alunos', type: 'string[]', label: 'Alunos' }
	],
	defaults: {
		TaskLabel: 'Nova tarefa',
		TaskType: DEFAULT_TASK_TYPE,
		texto: 'Escreva o texto principal da tarefa aqui.',
		alunos: ['Aluno 1', 'Aluno 2']
	}
};

const OFICIO_MANIFEST: TemplateManifest = {
	id: 'oficio',
	name: 'Oficio',
	version: '1.0.0',
	description: 'Modelo simples para oficio.',
	entry: 'main.tex',
	schema: [
		{ key: 'destinatario', type: 'string', label: 'Destinatario' },
		{ key: 'assunto', type: 'string', label: 'Assunto' },
		{ key: 'texto', type: 'latex', label: 'Texto' }
	],
	defaults: {
		TaskLabel: 'Novo oficio',
		TaskType: DEFAULT_TASK_TYPE,
		destinatario: 'Destinatario',
		assunto: 'Assunto do oficio',
		texto: 'Escreva o corpo do oficio aqui.'
	}
};

const TAREFA_SOURCE = String.raw`\documentclass[12pt]{article}
\usepackage[utf8]{inputenc}
\usepackage[brazil]{babel}
\usepackage{geometry}
\usepackage{parskip}
\usepackage[most]{tcolorbox}
\geometry{a4paper, margin=2.4cm}

\input{co_data.tex}

\begin{document}

\begin{center}
{\Large\bfseries \TaskLabel}\par
\vspace{0.2cm}
\textbf{Tipo:} \TaskType
\end{center}

\vspace{0.6cm}
\begin{tcolorbox}[colback=white,colframe=black,left=3mm,right=3mm,top=2mm,bottom=2mm,title=Texto]
\texto
\end{tcolorbox}

\vspace{0.8cm}
\textbf{Alunos}\par
\alunos

\end{document}`;

const OFICIO_SOURCE = String.raw`\documentclass[12pt]{article}
\usepackage[utf8]{inputenc}
\usepackage[brazil]{babel}
\usepackage{geometry}
\usepackage{parskip}
\geometry{a4paper, margin=2.5cm}

\input{co_data.tex}

\begin{document}

\begin{flushright}
\TaskLabel
\end{flushright}

\textbf{Tipo:} \TaskType\par
\textbf{Destinatario:} \destinatario\par
\textbf{Assunto:} \assunto

\vspace{1cm}
\texto

\end{document}`;

export const DIAGRAMADOR_DEFAULT_CREATE_TEMPLATE_ID = 'tarefa';
export const DIAGRAMADOR_TEMPLATE_OPTIONS = [
	{ id: 'tarefa', label: 'Tarefa', description: 'Template padrao para nova tarefa.' },
	{ id: 'oficio', label: 'Oficio', description: 'Modelo de oficio.' }
] as const;

export const DIAGRAMADOR_MANAGED_TEMPLATES: DiagramadorSeedTemplate[] = [
	{
		manifest: TAREFA_MANIFEST,
		mainTex: TAREFA_SOURCE,
		previewData: cloneDefaults((TAREFA_MANIFEST.defaults ?? {}) as Record<string, unknown>)
	},
	{
		manifest: OFICIO_MANIFEST,
		mainTex: OFICIO_SOURCE,
		previewData: cloneDefaults((OFICIO_MANIFEST.defaults ?? {}) as Record<string, unknown>)
	}
];
