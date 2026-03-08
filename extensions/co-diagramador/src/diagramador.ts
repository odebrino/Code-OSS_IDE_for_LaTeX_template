/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CoProjectV1 } from 'co-doc-core';

export type DiagramadorProject = CoProjectV1;

export type DiagramadorTaskType = 'teorica' | 'pratica' | 'salinha';

export const DEFAULT_TEMPLATE_ID = 'tarefa';
export const LEGACY_TEMPLATE_ID = 'test_v0';
export const DEFAULT_TASK_TYPE: DiagramadorTaskType = 'teorica';

export const TEMPLATE_TEST_V0 = String.raw`\documentclass[12pt]{article}

% ========= Pagina =========
\usepackage[a4paper,left=3cm,right=3cm,top=0.75cm,bottom=2.5cm]{geometry}
\usepackage[brazil]{babel}
\usepackage{graphicx}
\usepackage[most]{tcolorbox}
\usepackage{iftex}

\pagestyle{empty}
\setlength{\parindent}{0pt}
\setlength{\parskip}{6pt}

% ========= Fonte (depois do titulo) =========
\ifPDFTeX
\usepackage[T1]{fontenc}
\usepackage[utf8]{inputenc}
\fi
\usepackage{lmodern}
\newcommand{\comic}{\sffamily}

% ========= Variaveis =========
\newcommand{\HeaderImage}{assets/modelo_header_image1.jpg}
\input{co_data.tex}

% ========= Molduras =========
\newtcolorbox{FrameBox}[1][]{%
enhanced,
breakable,
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

% ======== A PARTIR DAQUI: Sans serif (fallback) ========
\comic

% ========= Divulgacao =========
\textbf{Divulgacao:}\par
\InfoRow{\DivulgDate}{\DivulgTime}{\DivulgLocal}

% 1o retangulo (vazio)
\begin{FrameBox}
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

\begin{FrameBox}
\Sponsors
\end{FrameBox}

\vspace{0.8cm}

% ========= Alimento =========
\textbf{ALIMENTO}\par

\begin{FrameBox}
\Food
\end{FrameBox}

\end{document}`;

/**
 * Create an empty schema v1 project with the default template.
 */
export function createDefaultProject(): DiagramadorProject {
	return {
		schemaVersion: 1,
		templateId: DEFAULT_TEMPLATE_ID,
		data: {}
	};
}
