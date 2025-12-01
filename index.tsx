/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";
import Papa from 'papaparse';

// Access mammoth from the global window object (loaded via script tag)
// using bracket notation to be safe for both JS and TS parsers in Babel
const mammoth = window["mammoth"];

// --- TypeScript Interfaces ---
interface CSVRow {
  [key:string]: string;
}

interface CSVData {
  headers: string[];
  rows: CSVRow[];
}

interface AIFeedbackItem {
  field: string;
  feedback: string;
  severity: 'error' | 'suggestion' | 'success';
}

const PLACEHOLDER_TO_CSV_HEADER_MAP = {
    'cabecalho': 'CABECALHO',
    'oferta': 'NOME_COMERCIAL',
    'nome_comercial': 'NOME_COMERCIAL',
    'oferta_digital': 'OFERTA_DIGITAL',
    'intervalo_vigencia': 'INTERVALO_VIGENCIA',
    'dt_inicio_vigencia': 'DT_INICIO_VIGENCIA',
    'dt_fim_vigencia': 'DT_FIM_VIGENCIA',
    'intervalo_comercializ': 'INTERVALO_COMERCIALIZ',
    'escalonamento_precos': 'ESCALONAMENTO_PRECOS',
    'sub_campo_area_abrangencia_fixa': 'SUB_CAMPO_AREA_ABRANGENCIA_FIXA',
    'codigo_oferta': 'CODIGO_ANATEL',
    'tecnologia_servicos': 'TECNOLOGIA_SERVICOS',
    'recomendacoes_uso': 'RECOMENDACOES_USO',
    'nome_agrupador_sva_scm_servicos_adicionais': 'NOME_AGRUPADOR_SVA_SCM_SERVICOS_ADICIONAIS',
    'ligacoes_stfc': 'LIGACOES_STFC',
    'qtde_franquia_scm_condicoes_bl': 'QTDE_FRANQUIA_SCM_CONDICOES_BL',
    'taxa_download': 'TAXA_DOWNLOAD',
    'taxa_transmissao_upload': 'TAXA_TRANSMISSAO_UPLOAD',
    'taxas_adicionais': 'TAXAS_ADICIONAIS',
    'valores_taxas_adicionais': 'VALORES_TAXAS_ADICIONAIS',
    'preco': 'PRECO',
    'precos_individuais_oferta_conjunta': 'PRECOS_INDIVIDUAIS_OFERTA_CONJUNTA',
    'reajuste': 'REAJUSTE',
    'periodo_fidelizacao': 'PERIODO_FIDELIZACAO',
    'multa_rescisao_antecipada': 'MULTA_RESCISAO_ANTECIPADA',
    'modalidade_contratacao': 'MODALIDADE_CONTRATACAO',
    'condicoes_pagamento': 'CONDICOES_PAGAMENTO',
    'educacao_consumo': 'EDUCACAO_CONSUMO',
    'canais_atendimento': 'CANAIS_ATENDIMENTO',
    'detalhes_oferta': 'DETALHES_OFERTA',
    'versionamento': 'VERSIONAMENTO',
    'link_etiqueta_padrao': 'LINK_ETIQUETA_PADRAO',
    'minutos_locais': 'MINUTOS_LIGACOES_LOCAIS',
    'minutos_longa_distancia': 'MINUTOS_LIGACOES_LDN',
    'servicos_inteligentes': 'SERVICOS_INTELIGENTES_INCLUSOS',
};

const DEFAULT_AI_INSTRUCTIONS = `
Por favor, atue como um assistente de validação de documentos para uma empresa de telecomunicações.
Analise o seguinte conjunto de dados de um plano de serviço e verifique se há erros, inconsistências ou informações faltando, com base em boas práticas e lógica comercial.
Para cada problema encontrado, identifique o campo (a chave do JSON) onde o erro ocorreu.
Se nenhum erro for encontrado em todo o registro, retorne um array vazio [].

Exemplos de validação:
- O campo 'preco' deve ser um número válido.
- O 'intervalo_vigencia' deve ser um período de tempo lógico.
- A 'taxa_download' deve ser consistente com o 'nome_comercial' do plano.
`;


// --- Child Components ---
const StaticPreviewLayout = () => (
    <div className="static-preview-wrapper">
        <div className="vivo-header">
            <div className="vivo-header-left">
                <div className="vivo-logo">
                    <strong>vivo</strong>
                    <span>✳</span>
                </div>
                <h2>&#123;&#123;nome_comercial&#125;&#125;</h2>
                <p>&#123;&#123;cabecalho&#125;&#125;</p>
            </div>
            <div className="vivo-header-right">
                <p><strong>Oferta:</strong> &#123;&#123;nome_comercial&#125;&#125;</p>
                <p><strong>Oferta digital:</strong> &#123;&#123;oferta_digital&#125;&#125;</p>
                <p><strong>Prazo de vigência:</strong> &#123;&#123;intervalo_vigencia&#125;&#125;</p>
                <p><strong>Prazo de comercialização:</strong> &#123;&#123;intervalo_comercializ&#125;&#125;</p>
                <p><strong>Abrangência:</strong> &#123;&#123;escalonamento_precos&#125;&#125;</p>
                <p><strong>Código da oferta:</strong> &#123;&#123;codigo_oferta&#125;&#125;</p>
                <p><strong>Tecnologias:</strong> &#123;&#123;tecnologia_servicos&#125;&#125;</p>
                <p><strong>Recomendações de uso:</strong> &#123;&#123;recomendacoes_uso&#125;&#125;</p>
            </div>
        </div>
        <div className="vivo-content">
            <h3>Serviços adicionais</h3>
            <p><strong>Fixa:</strong> &#123;&#123;nome_agrupador_sva_scm_servicos_adicionais&#125;&#125;</p>
            <div className="stfc-box">
                <strong>Ligações STFC:</strong> &#123;&#123;ligacoes_stfc&#125;&#125;
            </div>
            
            <table className="vivo-table">
                <thead>
                    <tr><th colSpan={2}>Taxas e Adicionais</th></tr>
                </thead>
                <tbody>
                    <tr>
                        <td>Adesão R$&#123;&#123;taxas_adicionais&#125;&#125;</td>
                        <td>Instalação R$&#123;&#123;valores_taxas_adicionais&#125;&#125;</td>
                    </tr>
                </tbody>
            </table>
            
            <table className="vivo-table">
                <tbody>
                    <tr><th>Preço</th><td>R$&#123;&#123;preco&#125;&#125;</td></tr>
                    <tr><th>Preços individuais<br/>dos serviços da oferta conjunta</th><td>&#123;&#123;precos_individuais_oferta_conjunta&#125;&#125;</td></tr>
                    <tr><th>Critérios de reajuste</th><td>&#123;&#123;reajuste&#125;&#125;</td></tr>
                    <tr><th>Fidelização</th><td>&#123;&#123;periodo_fidelizacao&#125;&#125;</td></tr>
                    <tr><th>Multa por rescisão antecipada</th><td>&#123;&#123;multa_rescisao_antecipada&#125;&#125;</td></tr>
                </tbody>
            </table>

            <p><strong>Modalidade de contratação:</strong> &#123;&#123;modalidade_contratacao&#125;&#125;</p>
            <p><strong>Condições de pagamento:</strong> &#123;&#123;condicoes_pagamento&#125;&#125;</p>
            <p><strong>Educação para consumo:</strong> &#123;&#123;educacao_consumo&#125;&#125;</p>

            <h3>Informações complementares</h3>
            <ul>
                <li><strong>Canais de Atendimento:</strong> &#123;&#123;canais_atendimento&#125;&#125;</li>
                <li><strong>Detalhes da Oferta:</strong> &#123;&#123;detalhes_oferta&#125;&#125;</li>
                <li>Abrangente para áreas específicas nos seguintes Municípios: &#123;&#123;sub_campo_area_abrangencia_fixa&#125;&#125;</li>
                <li><strong>Versionamento:</strong> &#123;&#123;versionamento&#125;&#125;</li>
                <li><strong>Link Etiqueta Padrão:</strong> &#123;&#123;link_etiqueta_padrao&#125;&#125;</li>
            </ul>
        </div>
    </div>
);

interface DynamicPreviewProps {
    template: string;
    record: CSVRow;
    recordIndex: number;
    map: { [key: string]: string };
    feedbackItems?: AIFeedbackItem[];
    isValidating: boolean;
}

const DynamicPreview: React.FC<DynamicPreviewProps> = ({ template, record, recordIndex, map, feedbackItems, isValidating }) => {
    // FIX: Handle default value for feedbackItems internally to avoid potential `never[]` type inference issues.
    const currentFeedbackItems = feedbackItems || [];

    // Helper to just get the raw value from the record
    const getValue = (placeholderKey: string) => {
        // Special handling for the validity period
        if (placeholderKey === 'intervalo_vigencia') {
            const startDate = record[map['dt_inicio_vigencia']] || '';
            const endDate = record[map['dt_fim_vigencia']] || '';
            if (startDate && endDate) return `De ${startDate} até ${endDate}`;
            if (startDate) return `A partir de ${startDate}`;
            if (endDate) return `Até ${endDate}`;
            // FIX: Ensure a string is always returned.
            return '';
        }
        // General case
        const csvHeader = map[placeholderKey];
        return record[csvHeader] || '';
    };

    // Helper to wrap a value in a feedback span if needed (for React rendering in the header)
    const renderWithFeedback = (placeholderKey: string) => {
        const value = getValue(placeholderKey);
        const feedbackForItem = currentFeedbackItems.find(f => f.field === placeholderKey);
        if (feedbackForItem) {
            // FIX: Corrected type inference makes String() unnecessary and resolves the 'never' type error.
            const escapedFeedback = feedbackForItem.feedback.replace(/"/g, '&quot;').replace(/'/g, '&apos;');
            return (
                <span className={`has-feedback feedback-${feedbackForItem.severity}`} data-feedback={escapedFeedback}>
                    {value}
                </span>
            );
        }
        return <>{value}</>;
    };

    // This function will process the .docx content and return an HTML string
    const getReplacedDocxHtml = () => {
        if (!template) return '';
        let replacedHtml = template;
        const placeholders = template.match(/\{\{([^{}]+)\}\}/g) || [];

        placeholders.forEach(placeholderWithBraces => {
            const placeholderKey = placeholderWithBraces.replace(/[{}]/g, '').trim();
            const value = getValue(placeholderKey);
            const feedbackForItem = currentFeedbackItems.find(f => f.field === placeholderKey);
            let replacement = value;

            if (feedbackForItem) {
                // FIX: Corrected type inference makes String() unnecessary and resolves the 'never' type error.
                const escapedFeedback = feedbackForItem.feedback.replace(/"/g, '&quot;').replace(/'/g, '&apos;');
                replacement = `<span class="has-feedback feedback-${feedbackForItem.severity}" data-feedback="${escapedFeedback}">${value}</span>`;
            }
            
            const regex = new RegExp(placeholderWithBraces.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g');
            replacedHtml = replacedHtml.replace(regex, replacement);
        });

        return replacedHtml;
    };
    
    const generalFeedback = currentFeedbackItems.find(f => f.field === 'general');

    return (
        <div className="preview-record-wrapper" id={`record-preview-${recordIndex}`}>
            {isValidating && <div className="validation-overlay"><div className="loader"></div></div>}
            <h3 className="record-title">Registro {recordIndex + 1}</h3>
            {generalFeedback && (
                <div className={`general-feedback feedback-banner-${generalFeedback.severity}`}>
                    {generalFeedback.feedback}
                </div>
            )}
            
            {/* The main change: wrap content in the static layout, counteracting parent padding */}
            <div className="static-preview-wrapper" style={{ margin: '0 -1rem -1rem -1rem' }}>
                <div className="vivo-header">
                    <div className="vivo-header-left">
                        <div className="vivo-logo"><strong>vivo</strong><span>✳</span></div>
                        <h2>{renderWithFeedback('nome_comercial')}</h2>
                        <p>{renderWithFeedback('cabecalho')}</p>
                    </div>
                    <div className="vivo-header-right">
                        <p><strong>Oferta:</strong> {renderWithFeedback('nome_comercial')}</p>
                        <p><strong>Oferta digital:</strong> {renderWithFeedback('oferta_digital')}</p>
                        <p><strong>Prazo de vigência:</strong> {renderWithFeedback('intervalo_vigencia')}</p>
                        <p><strong>Prazo de comercialização:</strong> {renderWithFeedback('intervalo_comercializ')}</p>
                        <p><strong>Abrangência:</strong> {renderWithFeedback('escalonamento_precos')}</p>
                        <p><strong>Código da oferta:</strong> {renderWithFeedback('codigo_oferta')}</p>
                        <p><strong>Tecnologias:</strong> {renderWithFeedback('tecnologia_servicos')}</p>
                        <p><strong>Recomendações de uso:</strong> {renderWithFeedback('recomendacoes_uso')}</p>
                    </div>
                </div>
                <div className="vivo-content">
                     <div 
                        className="dynamic-preview-content"
                        dangerouslySetInnerHTML={{ __html: getReplacedDocxHtml() }}
                    />
                </div>
            </div>
            
            <hr className="record-separator" />
        </div>
    );
};

interface InstructionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (newInstructions: string) => void;
    initialInstructions: string;
}

const InstructionModal: React.FC<InstructionModalProps> = ({ isOpen, onClose, onSave, initialInstructions }) => {
    const [instructions, setInstructions] = useState(initialInstructions);

    useEffect(() => {
        setInstructions(initialInstructions);
    }, [initialInstructions, isOpen]);

    if (!isOpen) return null;

    const handleSave = () => {
        onSave(instructions);
        onClose();
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Ajustar Instruções de Validação da IA</h3>
                    <button className="close-btn" onClick={onClose}>&times;</button>
                </div>
                <div className="modal-content">
                    <p>Forneça as diretrizes que a IA deve seguir ao validar os registros. Seja claro e específico.</p>
                    <textarea
                        value={instructions}
                        onChange={(e) => setInstructions(e.target.value)}
                        rows={15}
                    ></textarea>
                </div>
                <div className="modal-footer">
                    <button className="btn" onClick={onClose}>Cancelar</button>
                    <button className="btn btn-primary" onClick={handleSave}>Salvar</button>
                </div>
            </div>
        </div>
    );
};


// --- Main App Component ---
const App = () => {
  // --- Initialization ---
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const templateInputRef = useRef<HTMLInputElement | null>(null);

  // --- State Management ---
  const [csvData, setCsvData] = useState<CSVData | null>(null);
  const [selectedColumnIndex, setSelectedColumnIndex] = useState<number | null>(null);
  const [aiFeedbacks, setAiFeedbacks] = useState<{ [recordIndex: number]: AIFeedbackItem[] }>({});
  const [isLoadingAI, setIsLoadingAI] = useState(false);
  const [validatingRecordIndex, setValidatingRecordIndex] = useState<number | null>(null);
  const [templateHtml, setTemplateHtml] = useState<string | null>(null);
  const [isTemplateLoading, setIsTemplateLoading] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredAnatelCode, setFilteredAnatelCode] = useState<string>('');
  const [aiInstructions, setAiInstructions] = useState(DEFAULT_AI_INSTRUCTIONS);
  const [isInstructionModalOpen, setIsInstructionModalOpen] = useState(false);


  // --- Resizing Logic State ---
  const [isResizing, setIsResizing] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(500);
  const mainContainerRef = useRef<HTMLElement | null>(null);

  // --- Derived State ---
  const anatelCodes = useMemo(() => {
    if (!csvData) return [];
    const codes = new Set(csvData.rows.map(row => row['CODIGO_ANATEL']).filter(Boolean));
    return Array.from(codes).sort();
  }, [csvData]);

  const displayedRows = useMemo(() => {
      if (!csvData) return [];
      
      const rowsWithOriginalIndex = csvData.rows.map((row, index) => ({
        ...row,
        originalIndex: index
      }));

      if (!filteredAnatelCode) {
        return rowsWithOriginalIndex;
      }

      return rowsWithOriginalIndex.filter(row => row['CODIGO_ANATEL'] === filteredAnatelCode);
  }, [csvData, filteredAnatelCode]);

  // --- Resizing Logic Effect ---
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isResizing && mainContainerRef.current) {
      const containerRect = mainContainerRef.current.getBoundingClientRect();
      let newWidth = e.clientX - containerRect.left;

      const minWidth = 300;
      const minRightWidth = 500;
      if (newWidth < minWidth) newWidth = minWidth;
      if (newWidth > containerRect.width - minRightWidth) {
        newWidth = containerRect.width - minRightWidth;
      }
      setSidebarWidth(newWidth);
    }
  }, [isResizing]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);


  // --- Event Handlers ---
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  const triggerCsvUpload = () => {
    fileInputRef.current?.click();
  };

  const triggerTemplateUpload = () => {
    templateInputRef.current?.click();
  };
  
  const handleCsvUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results: any) => {
            const headers = results.meta.fields || [];
            const rows = (results.data as CSVRow[]).filter(row =>
                headers.some((header: string) => row[header] && String(row[header]).trim() !== '')
            );
            
            setCsvData({ headers, rows });
            setAiFeedbacks({});
            setTemplateHtml(null); // Reset template on new CSV
            setFilteredAnatelCode(''); // Reset filter

            if (rows.length > 0) {
                setSelectedColumnIndex(0);
            } else {
                setSelectedColumnIndex(null);
            }
        },
        error: (error: any) => {
            console.error("Error parsing CSV file:", error);
            alert("Erro ao ler o arquivo CSV. Verifique o formato do arquivo.");
        },
    });
  };
  
  const handleTemplateUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsTemplateLoading(true);
    setTemplateError(null);
    setTemplateHtml(null);

    try {
        const arrayBuffer = await file.arrayBuffer();
        
        const options = {
            convertImage: mammoth.images.inline(),
            ignoreEmptyParagraphs: true,
        };

        const result = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer }, options);
        setTemplateHtml(result.value);
    } catch (error) {
        console.error("Error loading or converting template:", error);
        setTemplateError("Não foi possível carregar ou processar o template. Verifique se é um arquivo .docx válido.");
    } finally {
        setIsTemplateLoading(false);
    }
    if(event.target) {
        event.target.value = '';
    }
  };

  const handleCellEdit = (rowIndex: number, header: string, value: string) => {
    if (!csvData) return;
    
    const updatedRows = [...csvData.rows];
    updatedRows[rowIndex] = { ...updatedRows[rowIndex], [header]: value };

    setCsvData({ ...csvData, rows: updatedRows });
  };


  const handlePreview = useCallback((columnIndex: number) => {
      const element = document.getElementById(`record-preview-${columnIndex}`);
      if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      setSelectedColumnIndex(columnIndex);
  }, []);


  const handleValidate = async () => {
      if (selectedColumnIndex === null || !csvData) {
          alert("Nenhum registro selecionado para validar.");
          return;
      }

      setIsLoadingAI(true);
      setValidatingRecordIndex(selectedColumnIndex);
      setAiFeedbacks(prev => ({ ...prev, [selectedColumnIndex]: [] }));

      const recordToValidate = csvData.rows[selectedColumnIndex];
      const recordForAI: any = {};
      Object.keys(PLACEHOLDER_TO_CSV_HEADER_MAP).forEach(placeholderKey => {
          const csvHeader = PLACEHOLDER_TO_CSV_HEADER_MAP[placeholderKey as keyof typeof PLACEHOLDER_TO_CSV_HEADER_MAP];
          recordForAI[placeholderKey] = recordToValidate[csvHeader] || '';
      });

      try {
          const prompt = `
            ${aiInstructions}

            Dados para análise:
            ---
            ${JSON.stringify(recordForAI, null, 2)}
            ---
        `;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            field: {
                                type: Type.STRING,
                                description: 'A chave do campo que contém o problema (ex: "nome_comercial", "preco").'
                            },
                            feedback: {
                                type: Type.STRING,
                                description: 'Uma descrição clara do problema e uma sugestão de correção.'
                            },
                            severity: {
                                type: Type.STRING,
                                description: 'A severidade do problema. Use "error" para erros críticos ou "suggestion" para sugestões de melhoria.',
                                enum: ['error', 'suggestion']
                            }
                        }
                    }
                }
            }
        });
          
          const responseText = response.text;
          if (!responseText) {
            throw new Error("AI response was empty and could not be parsed.");
          }
          const feedbackItems: AIFeedbackItem[] = JSON.parse(responseText);

          if (feedbackItems.length === 0) {
              const successFeedback: AIFeedbackItem[] = [{
                  field: "general",
                  feedback: "Nenhum erro encontrado neste registro!",
                  severity: "success"
              }];
              setAiFeedbacks(prev => ({ ...prev, [selectedColumnIndex]: successFeedback }));
          } else {
              setAiFeedbacks(prev => ({ ...prev, [selectedColumnIndex]: feedbackItems }));
          }
      } catch (error) {
          console.error("Error with Gemini API or JSON parsing:", error);
          const errorFeedback: AIFeedbackItem[] = [{
              field: "general",
              feedback: "Ocorreu um erro ao tentar validar o documento. Por favor, tente novamente.",
              severity: "error"
          }];
          setAiFeedbacks(prev => ({ ...prev, [selectedColumnIndex]: errorFeedback }));
      } finally {
          setIsLoadingAI(false);
          setValidatingRecordIndex(null);
      }
  };

  const handleDownloadCsv = () => {
    if (!csvData) return;

    const csvString = Papa.unparse(csvData.rows, {
      delimiter: ";",
      header: true,
    });
    
    const bom = '\uFEFF';
    const blob = new Blob([bom + csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "dados_atualizados.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- Render Logic ---
  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={handleCsvUpload}
        accept=".csv"
      />
      <input
        type="file"
        ref={templateInputRef}
        style={{ display: 'none' }}
        onChange={handleTemplateUpload}
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      />

      <InstructionModal
        isOpen={isInstructionModalOpen}
        onClose={() => setIsInstructionModalOpen(false)}
        onSave={setAiInstructions}
        initialInstructions={aiInstructions}
      />

      <header>
        <h1>Validador de Documentos com IA</h1>
        <div className="header-controls">
            <button className="btn btn-primary" onClick={triggerCsvUpload}>
              Carregar CSV
            </button>
            <button
              className="btn"
              onClick={triggerTemplateUpload}
              disabled={!csvData || isTemplateLoading}>
              {isTemplateLoading ? "Carregando..." : "Carregar Template (.docx)"}
            </button>
            <button
              className="btn"
              onClick={() => setIsInstructionModalOpen(true)}
              disabled={!csvData}
              title="Ajustar instruções de validação da IA">
              Ajustar Instruções IA
            </button>
            <button
              className="btn btn-secondary"
              onClick={handleValidate}
              disabled={!csvData || isLoadingAI || selectedColumnIndex === null || !templateHtml}>
              {isLoadingAI ? "Validando..." : "Validar com IA"}
            </button>
            {csvData && anatelCodes.length > 0 && (
                <div className="filter-container">
                    <label htmlFor="anatel-filter">Filtrar por Cód. Anatel:</label>
                    <select
                        id="anatel-filter"
                        value={filteredAnatelCode}
                        onChange={(e) => setFilteredAnatelCode(e.target.value)}
                    >
                        <option value="">Todos os Registros</option>
                        {anatelCodes.map(code => (
                            <option key={code} value={code}>{code}</option>
                        ))}
                    </select>
                </div>
            )}
            <button
              className="btn btn-primary"
              onClick={handleDownloadCsv}
              disabled={!csvData}>
              Baixar CSV Atualizado
            </button>
        </div>
      </header>
      <main className="container" ref={mainContainerRef}>
        <div className="panel csv-panel" style={{ width: `${sidebarWidth}px` }}>
          <div className="panel-header">
            <span>Dados CSV</span>
            {csvData && (
              <input
                type="text"
                placeholder="Localizar campo..."
                className="search-input"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                aria-label="Localizar campo no CSV"
              />
            )}
          </div>
          <div className="panel-content table-container">
            {csvData ? (
              <table className="csv-table">
                <thead>
                  <tr>
                    <th>Campo</th>
                    {displayedRows.map(({ originalIndex }) => (
                      <th key={originalIndex} className="action-cell">
                        Registro {originalIndex + 1}
                        <button
                          title={`Visualizar Registro ${originalIndex + 1}`}
                          aria-label={`Visualizar Registro ${originalIndex + 1}`}
                          className={`preview-btn ${selectedColumnIndex === originalIndex ? 'active' : ''}`}
                          onClick={() => handlePreview(originalIndex)}>
                          👁️
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {csvData.headers
                    .filter(header => header.toLowerCase().includes(searchTerm.toLowerCase()))
                    .map((header) => (
                      <tr key={header}>
                        <td><strong>{header}</strong></td>
                        {displayedRows.map(({ originalIndex, ...row }) => (
                          <td
                            key={`${header}-${originalIndex}`}
                            contentEditable
                            suppressContentEditableWarning
                            onBlur={(e) => handleCellEdit(originalIndex, header, e.currentTarget.innerText)}>
                            {row[header]}
                          </td>
                        ))}
                      </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="placeholder-text">Carregue um arquivo CSV para começar.</p>
            )}
          </div>
        </div>

        <div className="resizer" onMouseDown={handleMouseDown}></div>

        <div className="right-content-area">
           <div className="panel preview-panel">
            <div className="panel-header">Pré-visualização do Documento</div>
            <div className="panel-content document-preview-container">
                {templateHtml && csvData && displayedRows.length > 0 ? (
                    displayedRows.map(({ originalIndex, ...row }) => (
                       <DynamicPreview 
                            key={originalIndex}
                            template={templateHtml}
                            record={row}
                            recordIndex={originalIndex}
                            map={PLACEHOLDER_TO_CSV_HEADER_MAP}
                            feedbackItems={aiFeedbacks[originalIndex]}
                            isValidating={validatingRecordIndex === originalIndex}
                       />
                    ))
                ) : (
                    templateError ? (
                        <div className="template-error-container">
                           <p className="template-error">{templateError}</p>
                        </div>
                    ) : (
                       <StaticPreviewLayout />
                    )
                )}
            </div>
          </div>
        </div>
      </main>
    </>
  );
};

const rootElement = document.getElementById('root');
if (rootElement) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(<App />);
} else {
    console.error("Target container 'root' not found in the DOM.");
}