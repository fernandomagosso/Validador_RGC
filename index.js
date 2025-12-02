/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
// NOTE: This file is the compiled version of index.tsx.
// It's standard JavaScript that runs in any modern browser without needing Babel.
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";
import Papa from 'papaparse';

const mammoth = window["mammoth"];

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
const DynamicPreview = ({ template, record, recordIndex, map, feedbackItems = [], isValidating }) => {
    const getValue = (placeholderKey) => {
        if (!map) return '';
        if (placeholderKey === 'intervalo_vigencia') {
            const startDate = record[map['dt_inicio_vigencia']] || '';
            const endDate = record[map['dt_fim_vigencia']] || '';
            if (startDate && endDate) return `De ${startDate} até ${endDate}`;
            if (startDate) return `A partir de ${startDate}`;
            if (endDate) return `Até ${endDate}`;
            return '';
        }
        const csvHeader = map[placeholderKey];
        return record[csvHeader] || '';
    };

    const getReplacedDocxHtml = () => {
        if (!template) return '';
        let replacedHtml = template;
        const placeholders = template.match(/\{\{([^{}]+)\}\}/g) || [];

        placeholders.forEach(placeholderWithBraces => {
            const placeholderKey = placeholderWithBraces.replace(/[{}]/g, '').trim();
            const value = getValue(placeholderKey);
            const feedbackForItem = feedbackItems.find(f => f.field === placeholderKey);
            let replacement = value;

            if (feedbackForItem) {
                const escapedFeedback = String(feedbackForItem.feedback).replace(/"/g, '&quot;').replace(/'/g, '&apos;');
                replacement = `<span class="has-feedback feedback-${feedbackForItem.severity}" data-feedback="${escapedFeedback}">${value}</span>`;
            }
            
            const regex = new RegExp(placeholderWithBraces.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g');
            replacedHtml = replacedHtml.replace(regex, replacement);
        });

        return replacedHtml;
    };
    
    const generalFeedback = feedbackItems.find(f => f.field === 'general');

    return (
        React.createElement("div", { className: "preview-record-wrapper", id: `record-preview-${recordIndex}` },
            isValidating && React.createElement("div", { className: "validation-overlay" }, React.createElement("div", { className: "loader" })),
            React.createElement("h3", { className: "record-title" }, "Registro ", recordIndex + 1),
            generalFeedback && (
                React.createElement("div", { className: `general-feedback feedback-banner-${generalFeedback.severity}` },
                    generalFeedback.feedback
                )
            ),
             React.createElement("div", {
                className: "dynamic-preview-content",
                dangerouslySetInnerHTML: { __html: getReplacedDocxHtml() }
            })
        )
    );
};

const InstructionModal = ({ isOpen, onClose, onSave, initialInstructions }) => {
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
        React.createElement("div", { className: "modal-overlay", onClick: onClose },
            React.createElement("div", { className: "modal", onClick: (e) => e.stopPropagation() },
                React.createElement("div", { className: "modal-header" },
                    React.createElement("h3", null, "Ajustar Instruções de Validação da IA"),
                    React.createElement("button", { className: "close-btn", onClick: onClose }, "\u00D7")
                ),
                React.createElement("div", { className: "modal-content" },
                    React.createElement("p", null, "Forneça as diretrizes que a IA deve seguir ao validar os registros. Seja claro e específico."),
                    React.createElement("textarea", {
                        value: instructions,
                        onChange: (e) => setInstructions(e.target.value),
                        rows: 15
                    })
                ),
                React.createElement("div", { className: "modal-footer" },
                    React.createElement("button", { className: "btn", onClick: onClose }, "Cancelar"),
                    React.createElement("button", { className: "btn btn-primary", onClick: handleSave }, "Salvar")
                )
            )
        )
    );
};

const ApiKeyModal = ({ isOpen, onClose, onSave, currentKey }) => {
    const [localKey, setLocalKey] = useState(currentKey);

    useEffect(() => {
        setLocalKey(currentKey);
    }, [isOpen, currentKey]);

    if (!isOpen) return null;

    const handleSave = () => { onSave(localKey); };
    const handleOverlayClick = currentKey ? onClose : () => {};

    return React.createElement("div", { className: "modal-overlay", onClick: handleOverlayClick },
        React.createElement("div", { className: "modal", onClick: e => e.stopPropagation() },
            React.createElement("div", { className: "modal-header" },
                React.createElement("h3", null, "Configurar Chave de API do Gemini"),
                currentKey && React.createElement("button", { className: "close-btn", onClick: onClose }, "×")
            ),
            React.createElement("div", { className: "modal-content" },
                React.createElement("p", null, "Para usar as funcionalidades de IA, por favor, insira sua chave de API do Google Gemini."),
                React.createElement("input", {
                    type: "password",
                    className: "api-key-input",
                    placeholder: "Cole sua chave de API aqui",
                    value: localKey,
                    onChange: e => setLocalKey(e.target.value)
                }),
                React.createElement("p", { className: "api-key-helper-text" },
                    "Sua chave é armazenada apenas no seu navegador e nunca é enviada para nossos servidores. ",
                    React.createElement("a", { href: "https://aistudio.google.com/app/apikey", target: "_blank", rel: "noopener noreferrer" }, "Obtenha sua chave aqui.")
                )
            ),
            React.createElement("div", { className: "modal-footer" },
                currentKey && React.createElement("button", { className: "btn", onClick: onClose }, "Cancelar"),
                React.createElement("button", { className: "btn btn-primary", onClick: handleSave }, "Salvar Chave")
            )
        )
    );
};

const Toast = ({ message, type, onDismiss }) => {
    useEffect(() => {
        const timer = setTimeout(() => {
            onDismiss();
        }, 5000);
        return () => clearTimeout(timer);
    }, [onDismiss]);

    return (
        React.createElement("div", { className: `toast toast-${type}` },
            React.createElement("span", null, message),
            React.createElement("button", { onClick: onDismiss, className: "toast-close-btn" }, "\u00D7")
        )
    );
};

const ColumnMappingModal = ({ isOpen, onClose, onApply, onSuggest, aiSuggestedMap, csvHeaders, isSuggesting }) => {
    const [userMap, setUserMap] = useState(null);

    useEffect(() => {
        if (aiSuggestedMap) {
            setUserMap(aiSuggestedMap);
        }
    }, [aiSuggestedMap]);

    if (!isOpen) return null;

    const handleSelectChange = (systemField, selectedCsvHeader) => {
        setUserMap(prev => ({ ...prev, [systemField]: selectedCsvHeader === 'null' ? null : selectedCsvHeader }));
    };
    
    const handleApply = () => {
        const finalMap = {};
        Object.keys(userMap).forEach(key => {
            if(userMap[key]) {
                finalMap[key] = userMap[key];
            }
        });
        onApply(finalMap);
    };

    return (
        React.createElement("div", { className: "modal-overlay" },
            React.createElement("div", { className: "modal modal-large", onClick: (e) => e.stopPropagation() },
                React.createElement("div", { className: "modal-header" },
                    React.createElement("h3", null, "Mapeamento de Colunas com IA"),
                    React.createElement("button", { className: "close-btn", onClick: onClose }, "\u00D7")
                ),
                React.createElement("div", { className: "modal-content" },
                    !aiSuggestedMap && !isSuggesting && (
                        React.createElement("div", { className: "mapping-intro" },
                            React.createElement("p", null, "Os cabeçalhos do seu CSV não correspondem ao nosso layout padrão."),
                            React.createElement("p", null, "Gostaria que a IA sugerisse um mapeamento para os campos conhecidos?")
                        )
                    ),
                    isSuggesting && React.createElement("div", { className: "loader-container" }, React.createElement("div", { className: "loader" }), React.createElement("p", null, "Analisando colunas...")),
                    aiSuggestedMap && userMap && (
                       React.createElement("div", { className: "mapping-table-container" },
                        React.createElement("p", null, "Revise e ajuste o mapeamento sugerido pela IA. Selecione a coluna do seu arquivo que corresponde a cada campo do sistema."),
                         React.createElement("table", { className: "mapping-table" },
                            React.createElement("thead", null, React.createElement("tr", null, 
                                React.createElement("th", null, "Campo do Sistema"),
                                React.createElement("th", null, "Sua Coluna (Sugerida pela IA)")
                            )),
                            React.createElement("tbody", null, 
                                Object.keys(PLACEHOLDER_TO_CSV_HEADER_MAP).map(systemField => (
                                    React.createElement("tr", { key: systemField },
                                        React.createElement("td", null, systemField),
                                        React.createElement("td", null, 
                                            React.createElement("select", { value: userMap[systemField] || 'null', onChange: (e) => handleSelectChange(systemField, e.target.value) },
                                                React.createElement("option", { value: "null" }, "--- Não Mapear ---"),
                                                csvHeaders.map(header => React.createElement("option", { key: header, value: header }, header))
                                            )
                                        )
                                    )
                                ))
                            )
                         )
                       )
                    )
                ),
                React.createElement("div", { className: "modal-footer" },
                    !aiSuggestedMap ? (
                        React.createElement(React.Fragment, null,
                            React.createElement("button", { className: "btn", onClick: onClose, disabled: isSuggesting }, "Cancelar"),
                            React.createElement("button", { className: "btn btn-primary", onClick: onSuggest, disabled: isSuggesting }, "Sugerir com IA")
                        )
                    ) : (
                        React.createElement(React.Fragment, null,
                             React.createElement("button", { className: "btn", onClick: onClose }, "Cancelar"),
                             React.createElement("button", { className: "btn btn-primary", onClick: handleApply }, "Aplicar Mapeamento")
                        )
                    )
                )
            )
        )
    );
};


const App = () => {
  const [apiKey, setApiKey] = useState('');
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  
  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  const ai = useMemo(() => {
    if (!apiKey) return null;
    try {
        return new GoogleGenAI({ apiKey });
    } catch (error) {
        console.error("Failed to initialize GoogleGenAI:", error);
        addToast("Chave de API inválida ou mal formatada.", "error");
        return null;
    }
  }, [apiKey, addToast]);

  const fileInputRef = useRef(null);
  const templateInputRef = useRef(null);

  const [csvData, setCsvData] = useState(null);
  const [selectedColumnIndex, setSelectedColumnIndex] = useState(null);
  const [aiFeedbacks, setAiFeedbacks] = useState({});
  const [validatingRecordIndex, setValidatingRecordIndex] = useState(null);
  const [templateHtml, setTemplateHtml] = useState(null);
  const [isTemplateLoading, setIsTemplateLoading] = useState(false);
  const [templateError, setTemplateError] = useState(null);
  const [filteredAnatelCode, setFilteredAnatelCode] = useState('');
  const [aiInstructions, setAiInstructions] = useState(DEFAULT_AI_INSTRUCTIONS);
  const [isInstructionModalOpen, setIsInstructionModalOpen] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(500);
  const mainContainerRef = useRef(null);
  
  const [validationStatuses, setValidationStatuses] = useState({}); // { [index]: 'not-validated' | 'validating' | 'success' | 'error' }
  const [isBatchValidating, setIsBatchValidating] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  
  const [toasts, setToasts] = useState([]);
  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);
  
  const [isMappingModalOpen, setIsMappingModalOpen] = useState(false);
  const [pendingCsvData, setPendingCsvData] = useState(null);
  const [aiSuggestedMap, setAiSuggestedMap] = useState(null);
  const [isSuggestingMap, setIsSuggestingMap] = useState(false);
  const [activeMapping, setActiveMapping] = useState(PLACEHOLDER_TO_CSV_HEADER_MAP);

  useEffect(() => {
    const savedKey = localStorage.getItem("gemini-api-key");
    if (savedKey) {
        setApiKey(savedKey);
    } else {
        setIsApiKeyModalOpen(true);
    }
  }, []);

  const handleSaveApiKey = (newKey) => {
    if (newKey && newKey.trim()) {
        setApiKey(newKey);
        localStorage.setItem("gemini-api-key", newKey);
        setIsApiKeyModalOpen(false);
        addToast("Chave de API salva com sucesso!", "success");
    } else {
        addToast("Chave de API não pode ser vazia.", "error");
    }
  };

  const anatelCodes = useMemo(() => {
    if (!csvData) return [];
    const anatelHeader = activeMapping['codigo_oferta'];
    if (!anatelHeader) return [];
    const codes = new Set(csvData.rows.map(row => row[anatelHeader]).filter(Boolean));
    return Array.from(codes).sort();
  }, [csvData, activeMapping]);

  const displayedRows = useMemo(() => {
      if (!csvData) return [];
      
      const rowsWithOriginalIndex = csvData.rows.map((row, index) => ({
        ...row,
        originalIndex: index
      }));

      if (!filteredAnatelCode) {
        return rowsWithOriginalIndex;
      }
      
      const anatelHeader = activeMapping['codigo_oferta'];
      if(!anatelHeader) return rowsWithOriginalIndex;

      return rowsWithOriginalIndex.filter(row => row[anatelHeader] === filteredAnatelCode);
  }, [csvData, filteredAnatelCode, activeMapping]);

  useEffect(() => {
    if (csvData) {
        const initialStatuses = {};
        csvData.rows.forEach((_, index) => {
            initialStatuses[index] = 'not-validated';
        });
        setValidationStatuses(initialStatuses);
    }
  }, [csvData]);
  
  const handleMouseMove = useCallback((e) => {
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
  
  useEffect(() => {
    if (displayedRows.length > 0) {
        const firstItemIndex = displayedRows[0].originalIndex;
        if (selectedColumnIndex === null) {
          setSelectedColumnIndex(firstItemIndex);
        }
        
        const element = document.getElementById(`record-preview-${firstItemIndex}`);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }
  }, [filteredAnatelCode, displayedRows, selectedColumnIndex]);

  const handleMouseDown = (e) => {
    e.preventDefault();
    setIsResizing(true);
  };

  const triggerCsvUpload = () => { fileInputRef.current?.click(); };
  const triggerTemplateUpload = () => { templateInputRef.current?.click(); };
  
    const finishCsvLoad = (data, mapping) => {
        setCsvData(data);
        setActiveMapping(mapping);
        setAiFeedbacks({});
        setFilteredAnatelCode('');
        addToast("CSV carregado com sucesso!", "success");

        if (data.rows.length > 0) {
            setSelectedColumnIndex(0);
            const element = document.getElementById(`record-preview-0`);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        } else {
            setSelectedColumnIndex(null);
        }
        
        setIsMappingModalOpen(false);
        setPendingCsvData(null);
        setAiSuggestedMap(null);
    };

    const handleCsvUpload = (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                const headers = results.meta.fields || [];
                const rows = results.data.filter(row =>
                    headers.some((header) => row[header] && String(row[header]).trim() !== '')
                );
                
                const data = { headers, rows };
                
                const defaultHeaders = Object.values(PLACEHOLDER_TO_CSV_HEADER_MAP);
                const matchCount = headers.filter(h => defaultHeaders.includes(h)).length;

                if (matchCount < defaultHeaders.length * 0.7) { 
                    setPendingCsvData(data);
                    setIsMappingModalOpen(true);
                } else {
                    finishCsvLoad(data, PLACEHOLDER_TO_CSV_HEADER_MAP);
                }
            },
            error: (error) => {
                console.error("Error parsing CSV file:", error);
                addToast("Erro ao ler o arquivo CSV.", "error");
            },
        });
        if(event.target) event.target.value = '';
    };

    const handleSuggestMapping = async () => {
        if (!ai) {
            addToast("Chave de API é necessária para sugerir mapeamento.", "error");
            setIsApiKeyModalOpen(true);
            return;
        }
        if (!pendingCsvData) return;

        setIsSuggestingMap(true);
        try {
            const systemFields = Object.keys(PLACEHOLDER_TO_CSV_HEADER_MAP);
            const userHeaders = pendingCsvData.headers;

            const properties = {};
            systemFields.forEach(field => {
                properties[field] = { type: Type.STRING, description: `O cabeçalho do CSV do usuário que melhor corresponde a '${field}'. Use null se não houver correspondência.` };
            });

            const prompt = `
                Você é um assistente de mapeamento de dados. Associe os cabeçalhos de um arquivo CSV de telecomunicações aos campos de um sistema pré-definido.
                
                Campos do sistema: ${systemFields.join(', ')}
                Cabeçalhos do usuário: ${userHeaders.join(', ')}

                Retorne um objeto JSON onde cada chave é um campo do sistema e o valor é o cabeçalho correspondente do usuário. Se não houver correspondência clara, use null para o valor.
            `;

            const response = await ai.models.generateContent({
                model: "gemini-2.5-flash",
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: Type.OBJECT,
                        properties: properties,
                    }
                }
            });

            const suggested = JSON.parse(response.text);
            setAiSuggestedMap(suggested);

        } catch (error) {
            console.error("Error suggesting mapping:", error);
            addToast("Erro ao obter sugestão da IA.", "error");
            const emptyMap = {};
            Object.keys(PLACEHOLDER_TO_CSV_HEADER_MAP).forEach(k => emptyMap[k] = null);
            setAiSuggestedMap(emptyMap);
        } finally {
            setIsSuggestingMap(false);
        }
    };
    
    const handleCloseMappingModal = () => {
        setIsMappingModalOpen(false);
        setPendingCsvData(null);
        setAiSuggestedMap(null);
    };

    const handleApplyMapping = (userConfirmedMap) => {
        finishCsvLoad(pendingCsvData, userConfirmedMap);
    };

  const handleTemplateUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsTemplateLoading(true);
    setTemplateError(null);
    setTemplateHtml(null);

    try {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        setTemplateHtml(result.value);
        addToast("Template carregado.", "success");
    } catch (error) {
        console.error("Error loading or converting template:", error);
        setTemplateError("Não foi possível carregar ou processar o template. Verifique se é um arquivo .docx válido.");
        addToast("Erro ao carregar template.", "error");
    } finally {
        setIsTemplateLoading(false);
    }
    if(event.target) {
        event.target.value = '';
    }
  };

  const handleCellEdit = (rowIndex, header, value) => {
    if (!csvData) return;
    const updatedRows = [...csvData.rows];
    updatedRows[rowIndex] = { ...updatedRows[rowIndex], [header]: value };
    setCsvData({ ...csvData, rows: updatedRows });
    setValidationStatuses(prev => ({ ...prev, [rowIndex]: 'not-validated' }));
  };

  const handlePreview = useCallback((columnIndex) => {
      const element = document.getElementById(`record-preview-${columnIndex}`);
      if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      setSelectedColumnIndex(columnIndex);
  }, []);

  const runValidationForIndex = async (index) => {
    if (!ai) {
        addToast("Chave de API não configurada. Configure-a no menu de configurações (⚙️).", "error");
        setIsApiKeyModalOpen(true);
        return 'error';
    }
      setValidatingRecordIndex(index);
      setValidationStatuses(prev => ({ ...prev, [index]: 'validating' }));
      setAiFeedbacks(prev => ({ ...prev, [index]: [] }));

      const recordToValidate = csvData.rows[index];
      const recordForAI = {};
      Object.keys(activeMapping).forEach(placeholderKey => {
          const csvHeader = activeMapping[placeholderKey];
          recordForAI[placeholderKey] = recordToValidate[csvHeader] || '';
      });

      try {
          const prompt = `${aiInstructions}\n\nDados para análise:\n---\n${JSON.stringify(recordForAI, null, 2)}\n---`;
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
                            field: { type: Type.STRING },
                            feedback: { type: Type.STRING },
                            severity: { type: Type.STRING, enum: ['error', 'suggestion'] }
                        }
                    }
                }
            }
          });
          
          const responseText = response.text;
          if (!responseText || responseText.trim() === '') throw new Error("A resposta da IA estava vazia.");
          
          let feedbackItems = JSON.parse(responseText);
          if (!Array.isArray(feedbackItems)) throw new Error("A resposta da IA não está no formato de array esperado.");
          
          if (feedbackItems.length === 0) {
              const successFeedback = [{ field: "general", feedback: "Nenhum erro encontrado neste registro!", severity: "success" }];
              setAiFeedbacks(prev => ({ ...prev, [index]: successFeedback }));
              setValidationStatuses(prev => ({ ...prev, [index]: 'success' }));
              return 'success';
          } else {
              setAiFeedbacks(prev => ({ ...prev, [index]: feedbackItems }));
              setValidationStatuses(prev => ({ ...prev, [index]: 'error' }));
              return 'error';
          }
      } catch (error) {
          console.error(`Error validating record ${index}:`, error);
          const errorMsg = error.message.includes("API key not valid") ? "Chave de API inválida." : `Ocorreu um erro: ${error.message}`;
          const errorFeedback = [{ field: "general", feedback: errorMsg, severity: "error" }];
          setAiFeedbacks(prev => ({ ...prev, [index]: errorFeedback }));
          setValidationStatuses(prev => ({ ...prev, [index]: 'error' }));
          return 'error';
      } finally {
          setValidatingRecordIndex(null);
      }
  };
  
  const handleValidateSingle = async () => {
    if (selectedColumnIndex === null) {
      addToast("Nenhum registro selecionado.", "error");
      return;
    }
    await runValidationForIndex(selectedColumnIndex);
  };
  
  const handleBatchValidate = async () => {
      setIsBatchValidating(true);
      const total = displayedRows.length;
      setBatchProgress({ current: 0, total });

      for (let i = 0; i < total; i++) {
          const row = displayedRows[i];
          setBatchProgress({ current: i + 1, total });
          handlePreview(row.originalIndex);
          const result = await runValidationForIndex(row.originalIndex);
          if (result === 'error' && !ai) break; 
      }

      setIsBatchValidating(false);
      addToast("Validação em lote concluída!", "success");
  };

  const handleDownloadCsv = () => {
    if (!csvData) return;
    const csvString = Papa.unparse(csvData.rows, { delimiter: ";", header: true });
    const bom = '\uFEFF';
    const blob = new Blob([bom + csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "dados_atualizados.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  const ValidationStatusIcon = ({ status }) => {
    switch (status) {
        case 'validating': return React.createElement("span", { className: "status-icon validating", title: "Validando..." }, "\u21BB");
        case 'success': return React.createElement("span", { className: "status-icon success", title: "Validado com sucesso" }, "\u2714\uFE0F");
        case 'error': return React.createElement("span", { className: "status-icon error", title: "Erros encontrados" }, "\u274C");
        default: return React.createElement("span", { className: "status-icon not-validated", title: "Não validado" }, "\u26AA\uFE0F");
    }
  };

  return (
    React.createElement(React.Fragment, null,
      React.createElement("div", { className: "toast-container" },
        toasts.map(toast => React.createElement(Toast, { key: toast.id, ...toast, onDismiss: () => removeToast(toast.id) }))
      ),
      React.createElement(ApiKeyModal, { isOpen: isApiKeyModalOpen, onClose: () => setIsApiKeyModalOpen(false), onSave: handleSaveApiKey, currentKey: apiKey }),
      React.createElement(InstructionModal, { isOpen: isInstructionModalOpen, onClose: () => setIsInstructionModalOpen(false), onSave: setAiInstructions, initialInstructions: aiInstructions }),
      React.createElement(ColumnMappingModal, { 
        isOpen: isMappingModalOpen,
        onClose: handleCloseMappingModal,
        onSuggest: handleSuggestMapping,
        onApply: handleApplyMapping,
        aiSuggestedMap: aiSuggestedMap,
        csvHeaders: pendingCsvData ? pendingCsvData.headers : [],
        isSuggesting: isSuggestingMap,
      }),
      React.createElement("input", { type: "file", ref: fileInputRef, style: { display: 'none' }, onChange: handleCsvUpload, accept: ".csv" }),
      React.createElement("input", { type: "file", ref: templateInputRef, style: { display: 'none' }, onChange: handleTemplateUpload, accept: ".docx" }),
      React.createElement("header", null,
        React.createElement("h1", null, "Validador RGC com IA"),
        React.createElement("div", { className: "header-actions" },
          React.createElement("div", { className: "header-group" },
            React.createElement("button", { className: "btn", onClick: triggerCsvUpload }, "Carregar CSV"),
            React.createElement("button", { className: "btn", onClick: triggerTemplateUpload, disabled: isTemplateLoading }, isTemplateLoading ? "Carregando..." : "Carregar Template"),
            React.createElement("button", { className: "btn", onClick: handleDownloadCsv, disabled: !csvData }, "Baixar CSV")
          ),
          React.createElement("div", { className: "header-group" },
            React.createElement("button", { className: "btn btn-secondary", onClick: handleValidateSingle, disabled: !ai || !csvData || isBatchValidating || validatingRecordIndex !== null || selectedColumnIndex === null || !templateHtml }, "Validar Selecionado"),
            React.createElement("button", { className: "btn btn-primary", onClick: handleBatchValidate, disabled: !ai || !csvData || isBatchValidating || validatingRecordIndex !== null || !templateHtml }, isBatchValidating ? `Validando ${batchProgress.current}/${batchProgress.total}...` : "Validar Visíveis")
          ),
          React.createElement("div", { className: "header-group" },
             csvData && anatelCodes.length > 0 && (
                React.createElement("div", { className: "filter-group" },
                  React.createElement("label", { htmlFor: "anatel-filter" }, "Cód. Anatel:"),
                  React.createElement("select", { id: "anatel-filter", value: filteredAnatelCode, onChange: (e) => setFilteredAnatelCode(e.target.value) },
                    React.createElement("option", { value: "" }, "Todos"),
                    anatelCodes.map(code => React.createElement("option", { key: code, value: code }, code))
                  ),
                  filteredAnatelCode && (React.createElement("button", { className: "clear-filter-btn", onClick: () => setFilteredAnatelCode(''), title: "Limpar filtro" }, "\u00D7"))
                )
             ),
             React.createElement("button", { className: "btn", onClick: () => setIsInstructionModalOpen(true), disabled: !ai, title: "Ajustar instruções de validação da IA" }, "Instruções IA"),
             React.createElement("button", { className: "btn settings-btn", onClick: () => setIsApiKeyModalOpen(true), title: "Configurações" }, "\u2699\uFE0F")
          )
        )
      ),
      React.createElement("main", { className: "container", ref: mainContainerRef },
        React.createElement("div", { className: "panel csv-panel", style: { width: `${sidebarWidth}px` } },
          React.createElement("div", { className: "panel-header" }, "Dados CSV" ),
          React.createElement("div", { className: "panel-content table-container" },
            csvData ? (
              React.createElement("table", { className: "csv-table" },
                React.createElement("thead", null, React.createElement("tr", null,
                  React.createElement("th", null, "Campo"),
                  displayedRows.map(({ originalIndex }) => (
                    React.createElement("th", { key: originalIndex, className: "action-cell" },
                      React.createElement("div", { className: "record-header" },
                        React.createElement(ValidationStatusIcon, { status: validationStatuses[originalIndex] }),
                        React.createElement("span", null, "R.", originalIndex + 1),
                        React.createElement("button", { title: `Visualizar Registro ${originalIndex + 1}`, className: `preview-btn ${selectedColumnIndex === originalIndex ? 'active' : ''}`, onClick: () => handlePreview(originalIndex) },
                          React.createElement("svg", { fill: "currentColor", viewBox: "0 0 16 16", height: "1em", width: "1em" }, React.createElement("path", { d: "M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8zM1.173 8a13.133 13.133 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.133 13.133 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.12 12.5 8 12.5c-2.12 0-3.879-1.168-5.168-2.457A13.134 13.134 0 0 1 1.172 8z" }), React.createElement("path", { d: "M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0z" }))
                        )
                      )
                    )
                  ))
                )),
                React.createElement("tbody", null,
                  csvData.headers.map((header) => (
                    React.createElement("tr", { key: header },
                      React.createElement("td", null, React.createElement("strong", null, header)),
                      displayedRows.map(({ originalIndex, ...row }) => (
                        React.createElement("td", { key: `${header}-${originalIndex}`, contentEditable: true, suppressContentEditableWarning: true, onBlur: (e) => handleCellEdit(originalIndex, header, e.currentTarget.innerText) }, row[header])
                      ))
                    )
                  ))
                )
              )
            ) : React.createElement("p", { className: "placeholder-text" }, "Carregue um arquivo CSV para começar.")
          )
        ),
        React.createElement("div", { className: "resizer", onMouseDown: handleMouseDown }),
        React.createElement("div", { className: "right-content-area" },
           React.createElement("div", { className: "panel preview-panel" },
            React.createElement("div", { className: "panel-header" }, "Pré-visualização do Documento"),
            React.createElement("div", { className: "panel-content document-preview-container" },
                templateHtml && csvData && displayedRows.length > 0 ? (
                    displayedRows.map(({ originalIndex, ...row }) => (
                       React.createElement(DynamicPreview, {
                            key: originalIndex,
                            template: templateHtml,
                            record: row,
                            recordIndex: originalIndex,
                            map: activeMapping,
                            feedbackItems: aiFeedbacks[originalIndex],
                            isValidating: validatingRecordIndex === originalIndex
                       })
                    ))
                ) : templateError ? (
                    React.createElement("div", { className: "template-error-container" }, React.createElement("p", { className: "template-error" }, templateError))
                ) : csvData && displayedRows.length === 0 ? (
                    React.createElement("div", { className: "placeholder-text" }, React.createElement("p", null, "Nenhum registro encontrado para o filtro selecionado."))
                ) : React.createElement("p", { className: "placeholder-text" }, "Carregue um arquivo .docx como template para visualizar os registros.")
            )
          )
        )
      )
    )
  );
};

const rootElement = document.getElementById('root');
if (rootElement) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(React.createElement(App, null));
} else {
    console.error("Target container 'root' not found in the DOM.");
}
