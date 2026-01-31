// === SPA NAVIGATION ===
function navigateTo(viewId) {
    // Hide all views
    document.querySelectorAll('.view').forEach(view => {
        view.classList.remove('active');
    });

    // Show target view
    document.getElementById(viewId).classList.add('active');

    // Load data based on view
    if (viewId === 'modelo-view') {
        loadTemplateData();
    } else if (viewId === 'diagram-view') {
        loadTemplateForDiagram();
    }
}

// === TEMPLATE MANAGEMENT ===
async function loadTemplateData() {
    try {
        const response = await fetch('/api/template');
        const data = await response.json();

        document.getElementById('tpl-name').value = data.name || '';
        document.getElementById('tpl-edition').value = data.edition || '';
        document.getElementById('tpl-days').value = data.days || '';
        document.getElementById('tpl-sponsors').value = data.sponsors || '';
    } catch (error) {
        console.error('Erro ao carregar template:', error);
    }
}

async function loadTemplateForDiagram() {
    try {
        const response = await fetch('/api/template');
        const data = await response.json();

        // Store template data for use in form submission
        window.templateData = data;

        // Display model name
        const modelNameEl = document.getElementById('current-model-name');
        if (data.name) {
            modelNameEl.textContent = data.name;
            modelNameEl.style.color = '#4CAF50';
        } else {
            modelNameEl.textContent = 'Nenhum modelo configurado';
            modelNameEl.style.color = '#F2C94C';
        }
    } catch (error) {
        console.error('Erro ao carregar template:', error);
        window.templateData = {};
    }
}

// Template Form Submission
document.getElementById('templateForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(e.target);
    const data = {
        name: formData.get('name'),
        edition: formData.get('edition'),
        days: formData.get('days'),
        sponsors: formData.get('sponsors') || ''
    };

    const statusDiv = document.getElementById('template-status');
    statusDiv.classList.remove('hidden');
    statusDiv.textContent = '⏳ Salvando...';
    statusDiv.style.color = '#F2C94C';

    try {
        const response = await fetch('/api/template', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            throw new Error('Erro ao salvar');
        }

        statusDiv.textContent = '✅ Modelo salvo com sucesso!';
        statusDiv.style.color = '#4CAF50';

        setTimeout(() => {
            statusDiv.classList.add('hidden');
        }, 3000);

    } catch (error) {
        statusDiv.textContent = '❌ Erro: ' + error.message;
        statusDiv.style.color = '#f44336';
    }
});

// === TASK FORM SUBMISSION ===
document.getElementById('taskForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(e.target);
    const template = window.templateData || {};

    const data = {
        title: formData.get('title'),
        intro: formData.get('intro'),
        members: formData.get('members') || '',
        series: formData.get('series') || 'Gincana 2025',
        difficulty: formData.get('difficulty') || 'Médio',
        task_type: 'Tarefa',

        // Use template data for header
        edition: template.edition || '40',
        days_event: template.days || '2, 3, 4, 5',
        month_event: 'ABRIL',
        year_event: '2025',

        // Cronograma
        date_release: formData.get('date_release') || '',
        time_release: formData.get('time_release') || '',
        location_release: formData.get('location_release') || '',
        date_compliance: formData.get('date_compliance') || '',
        time_compliance: formData.get('time_compliance') || '',
        location_compliance: formData.get('location_compliance') || '',

        // Legacy/Optional
        evaluation: '',
        score: '',
        num_students: ''
    };

    const statusDiv = document.getElementById('status');
    statusDiv.classList.remove('hidden');
    statusDiv.textContent = '⏳ Gerando PDF...';
    statusDiv.style.color = '#F2C94C';

    try {
        const response = await fetch('/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            throw new Error('Erro ao gerar PDF');
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${data.title.replace(/\s+/g, '_')}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);

        statusDiv.textContent = '✅ PDF gerado com sucesso!';
        statusDiv.style.color = '#4CAF50';

        setTimeout(() => {
            statusDiv.classList.add('hidden');
        }, 3000);

    } catch (error) {
        statusDiv.textContent = '❌ Erro: ' + error.message;
        statusDiv.style.color = '#f44336';
    }
});

// === SPLASH SCREEN TIMING ===
setTimeout(() => {
    document.getElementById('splash-screen').style.display = 'none';
    document.getElementById('app-container').classList.remove('hidden');
}, 3000);
