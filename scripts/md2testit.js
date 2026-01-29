#!/usr/bin/env node
/**
 * md2testit.js — PoC парсер markdown → TestIT Excel
 * 
 * Usage:
 *   node scripts/md2testit.js input.md [output.xlsx]
 * 
 * Формат входного markdown:
 *   # Название теста (опционально)
 *   
 *   Предусловие:
 *   1. Шаг предусловия
 *      1.1. Детали
 *   
 *   Шаги тестирования:
 *   1. Основной шаг
 *      1.1. Ожидаемый результат
 */

const fs = require('fs');
const path = require('path');

// =============================================================================
// Модель данных
// =============================================================================

/**
 * @typedef {Object} TestStep
 * @property {string} action - Действие
 * @property {string} expected - Ожидаемый результат
 */

/**
 * @typedef {Object} TestCase
 * @property {string} name - Название тест-кейса
 * @property {string[]} preconditions - Предусловия
 * @property {TestStep[]} steps - Шаги
 * @property {string} testData - Тестовые данные (JSON)
 */

// =============================================================================
// Парсер
// =============================================================================

/**
 * Парсит markdown документ в структуру тест-кейса.
 * @param {string} content - Содержимое markdown файла
 * @returns {TestCase}
 */
function parseMarkdown(content) {
  const result = {
    name: '',
    preconditions: [],
    steps: [],
    testData: '',
    exceptions: []
  };

  // Убираем комментарии из JSON (// comment)
  content = content.replace(/(".*?")\s*\/\/.*$/gm, '$1');

  // Извлекаем название из заголовка (если есть)
  const titleMatch = content.match(/^#\s+(.+)$/m);
  if (titleMatch) {
    result.name = titleMatch[1].trim();
  }

  // Разбиваем на секции
  const sections = splitSections(content);
  
  // Парсим каждую секцию
  if (sections.preconditions) {
    result.preconditions = parseSteps(sections.preconditions);
  }
  
  if (sections.steps) {
    result.steps = parseTestSteps(sections.steps);
  }

  if (sections.exceptions) {
    result.exceptions = [sections.exceptions.trim()];
  }

  // Генерируем название если не было
  if (!result.name && result.steps.length > 0) {
    result.name = generateName(result.steps[0]);
  }

  // Собираем тестовые данные из JSON блоков
  result.testData = extractTestData(content);

  return result;
}

/**
 * Разбивает документ на секции по ключевым словам.
 */
function splitSections(content) {
  const sections = {
    preconditions: '',
    steps: '',
    exceptions: ''
  };

  // Ищем маркеры секций (case-insensitive)
  const precondStart = content.search(/предусловие?:/i);
  const stepsStart = content.search(/шаги тестирования:/i);
  const exceptStart = content.search(/исключение?:/i);

  // Извлекаем текст между маркерами
  if (precondStart !== -1) {
    const endPos = stepsStart !== -1 ? stepsStart : (exceptStart !== -1 ? exceptStart : content.length);
    sections.preconditions = content.substring(precondStart, endPos);
  }

  if (stepsStart !== -1) {
    const endPos = exceptStart !== -1 ? exceptStart : content.length;
    sections.steps = content.substring(stepsStart, endPos);
  }

  if (exceptStart !== -1) {
    sections.exceptions = content.substring(exceptStart);
  }

  return sections;
}

/**
 * Парсит нумерованные шаги в массив строк.
 */
function parseSteps(text) {
  const steps = [];
  
  // Ищем строки начинающиеся с "N. " (основные шаги)
  const mainStepPattern = /^(\d+)\.\s+(.+?)(?=^\d+\.|$)/gms;
  
  let match;
  while ((match = mainStepPattern.exec(text)) !== null) {
    const stepNum = match[1];
    const stepContent = match[2].trim();
    
    // Объединяем основной шаг с подшагами в одну строку
    const cleanStep = stepContent
      .replace(/\n\s+\d+\.\d+\.\s+/g, '\n• ')  // Подшаги → буллеты
      .replace(/\n{2,}/g, '\n')                 // Убираем лишние переводы
      .trim();
    
    steps.push(`${stepNum}. ${cleanStep}`);
  }

  return steps;
}

/**
 * Парсит шаги тестирования в структуру {action, expected}.
 */
function parseTestSteps(text) {
  const steps = [];
  
  // Разбиваем на основные шаги (1., 2., 3., ...)
  const chunks = text.split(/(?=^\d+\.\s+)/m).filter(s => s.trim());

  for (const chunk of chunks) {
    // Извлекаем номер и текст основного шага
    const mainMatch = chunk.match(/^(\d+)\.\s+(.+?)(?=\n\s+\d+\.\d+\.|\n*$)/s);
    if (!mainMatch) continue;

    const stepNum = mainMatch[1];
    const action = mainMatch[2].trim();

    // Ищем подшаги (1.1., 1.2., ...)
    const subSteps = [];
    const subPattern = /(\d+\.\d+)\.\s+(.+?)(?=\d+\.\d+\.|$)/gs;
    let subMatch;
    
    while ((subMatch = subPattern.exec(chunk)) !== null) {
      subSteps.push({
        num: subMatch[1],
        text: subMatch[2].trim()
      });
    }

    // Формируем expected из подшагов
    let expected = '';
    if (subSteps.length > 0) {
      expected = subSteps
        .map(s => `${s.num}. ${truncateJson(s.text)}`)
        .join('\n');
    }

    steps.push({
      action: `${stepNum}. ${action}`,
      expected: expected || 'Шаг выполнен успешно'
    });
  }

  return steps;
}

/**
 * Сокращает JSON блоки для читаемости.
 */
function truncateJson(text) {
  // Если текст содержит большой JSON, сокращаем
  return text
    .replace(/\{[\s\S]{200,}?\}/g, '{...JSON...}')  // Большие объекты
    .replace(/\n{2,}/g, '\n')                        // Лишние переводы строк
    .trim();
}

/**
 * Извлекает JSON блоки как тестовые данные.
 */
function extractTestData(content) {
  const jsonBlocks = [];
  const jsonPattern = /```(?:json)?\s*([\s\S]*?)```|\{[\s\S]*?\}/g;
  
  let match;
  while ((match = jsonPattern.exec(content)) !== null) {
    const json = (match[1] || match[0]).trim();
    if (json.startsWith('{') && json.length < 500) {
      jsonBlocks.push(json);
    }
  }

  // Возвращаем первые 3 блока
  return jsonBlocks.slice(0, 3).join('\n---\n');
}

/**
 * Генерирует название из первого шага.
 */
function generateName(firstStep) {
  if (!firstStep) return 'Unnamed Test';
  
  // Ищем паттерн API запроса
  const apiMatch = firstStep.action.match(/(GET|POST|PUT|DELETE|PATCH)\s+([^\s]+)/i);
  if (apiMatch) {
    return `${apiMatch[1]} ${apiMatch[2]}`;
  }

  // Иначе берём первые 50 символов действия
  return firstStep.action.substring(0, 50).replace(/^\d+\.\s*/, '');
}

// =============================================================================
// Excel Export (простая реализация через CSV-подобный формат)
// =============================================================================

/**
 * Экспортирует тест-кейс в формат для TestIT.
 * Для PoC используем TSV (Tab-Separated Values), который Excel открывает.
 */
function exportToTsv(testCase, outputPath) {
  const headers = [
    'ID', 'Расположение', 'Наименование', 'Автоматизирован',
    'Предусловия', 'Шаги', 'Постусловия', 'Ожидаемый результат',
    'Тестовые данные', 'Комментарии', 'Итерации', 'Приоритет',
    'Статус', 'Дата создания', 'Автор', 'Длительность', 'Тег'
  ];

  const rows = [headers.join('\t')];
  const now = new Date().toLocaleString('ru-RU');

  // Главная строка с метаданными
  const mainRow = [
    '1',                                    // ID
    'API Tests',                            // Расположение
    testCase.name,                          // Наименование
    'Нет',                                  // Автоматизирован
    '',                                     // Предусловия (заполним ниже)
    '',                                     // Шаги
    '',                                     // Постусловия
    '',                                     // Ожидаемый результат
    '',                                     // Тестовые данные
    testCase.exceptions.join('; ') || '',   // Комментарии
    '1',                                    // Итерации
    'Средний',                              // Приоритет
    'Готов',                                // Статус
    now,                                    // Дата создания
    'md2testit',                            // Автор
    '0h 5m 0s',                             // Длительность
    'API'                                   // Тег
  ];
  rows.push(mainRow.map(escapeCell).join('\t'));

  // Строки предусловий
  for (const precond of testCase.preconditions) {
    const row = new Array(17).fill('');
    row[4] = precond;  // COL_PRECONDITIONS
    rows.push(row.map(escapeCell).join('\t'));
  }

  // Строки шагов
  for (const step of testCase.steps) {
    const row = new Array(17).fill('');
    row[5] = step.action;    // COL_STEPS
    row[7] = step.expected;  // COL_EXPECTED
    rows.push(row.map(escapeCell).join('\t'));
  }

  // Тестовые данные (в последнюю строку)
  if (testCase.testData) {
    const lastIdx = rows.length - 1;
    const lastRow = rows[lastIdx].split('\t');
    lastRow[8] = escapeCell(testCase.testData);
    rows[lastIdx] = lastRow.join('\t');
  }

  fs.writeFileSync(outputPath, rows.join('\n'), 'utf-8');
  return rows.length - 1; // Количество строк данных
}

/**
 * Экранирует ячейку для TSV.
 */
function escapeCell(value) {
  if (!value) return '';
  // Заменяем табы и переводы строк
  return value
    .replace(/\t/g, '    ')
    .replace(/\r?\n/g, ' | ');
}

// =============================================================================
// XLSX Export (с использованием xlsx-populate если доступен)
// =============================================================================

/**
 * Пробуем экспорт в настоящий XLSX через SheetJS.
 */
async function exportToXlsx(testCase, outputPath) {
  let XLSX;
  try {
    XLSX = require('xlsx');
  } catch (e) {
    console.log('⚠ xlsx модуль не найден, используем TSV формат');
    console.log('  Для XLSX: npm install xlsx');
    const tsvPath = outputPath.replace(/\.xlsx$/i, '.tsv');
    exportToTsv(testCase, tsvPath);
    return tsvPath;
  }

  const wb = XLSX.utils.book_new();
  
  // Формируем данные
  const data = [];
  
  // Заголовки
  data.push([
    'ID', 'Расположение', 'Наименование', 'Автоматизирован',
    'Предусловия', 'Шаги', 'Постусловия', 'Ожидаемый результат',
    'Тестовые данные', 'Комментарии', 'Итерации', 'Приоритет',
    'Статус', 'Дата создания', 'Автор', 'Длительность', 'Тег'
  ]);

  const now = new Date().toLocaleString('ru-RU');

  // Главная строка
  data.push([
    '1',                                    // ID
    'API Tests',                            // Расположение
    testCase.name,                          // Наименование
    'Нет',                                  // Автоматизирован
    '',                                     // Предусловия
    '',                                     // Шаги
    '',                                     // Постусловия
    '',                                     // Ожидаемый результат
    '',                                     // Тестовые данные
    testCase.exceptions.join('; ') || '',   // Комментарии
    '1',                                    // Итерации
    'Средний',                              // Приоритет
    'Готов',                                // Статус
    now,                                    // Дата создания
    'md2testit',                            // Автор
    '0h 5m 0s',                             // Длительность
    'API'                                   // Тег
  ]);

  // Предусловия
  for (const precond of testCase.preconditions) {
    const row = new Array(17).fill('');
    row[4] = precond;
    data.push(row);
  }

  // Шаги
  for (const step of testCase.steps) {
    const row = new Array(17).fill('');
    row[5] = step.action;
    row[7] = step.expected;
    data.push(row);
  }

  // Тестовые данные
  if (testCase.testData && data.length > 1) {
    data[data.length - 1][8] = testCase.testData;
  }

  const ws = XLSX.utils.aoa_to_sheet(data);
  
  // Устанавливаем ширину колонок
  ws['!cols'] = [
    { wch: 5 },   // ID
    { wch: 15 },  // Расположение
    { wch: 40 },  // Наименование
    { wch: 12 },  // Автоматизирован
    { wch: 50 },  // Предусловия
    { wch: 60 },  // Шаги
    { wch: 20 },  // Постусловия
    { wch: 60 },  // Ожидаемый результат
    { wch: 30 },  // Тестовые данные
    { wch: 30 },  // Комментарии
    { wch: 8 },   // Итерации
    { wch: 10 },  // Приоритет
    { wch: 10 },  // Статус
    { wch: 20 },  // Дата создания
    { wch: 12 },  // Автор
    { wch: 12 },  // Длительность
    { wch: 10 }   // Тег
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'TestCases');
  XLSX.writeFile(wb, outputPath);
  
  return outputPath;
}

// =============================================================================
// CLI
// =============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('md2testit — Парсер markdown → TestIT Excel\n');
    console.log('Usage: node scripts/md2testit.js <input.md> [output.xlsx]\n');
    console.log('Пример: node scripts/md2testit.js test-doc.md test-cases.xlsx');
    process.exit(1);
  }

  const inputPath = args[0];
  const outputPath = args[1] || inputPath.replace(/\.md$/i, '_TestCases.xlsx');

  // Проверяем входной файл
  if (!fs.existsSync(inputPath)) {
    console.error(`Ошибка: файл не найден: ${inputPath}`);
    process.exit(1);
  }

  console.log(`Парсинг: ${inputPath}`);

  // Читаем и парсим
  const content = fs.readFileSync(inputPath, 'utf-8');
  const testCase = parseMarkdown(content);

  // Выводим результат парсинга
  console.log('\n--- Результат парсинга ---');
  console.log(`Название: ${testCase.name}`);
  console.log(`Предусловий: ${testCase.preconditions.length}`);
  console.log(`Шагов: ${testCase.steps.length}`);
  
  if (testCase.steps.length > 0) {
    console.log('\nШаги:');
    for (const step of testCase.steps) {
      console.log(`  ${step.action.substring(0, 60)}...`);
    }
  }

  // Экспортируем
  console.log('\n--- Экспорт ---');
  const actualOutput = await exportToXlsx(testCase, outputPath);
  console.log(`Сохранено: ${actualOutput}`);
  console.log(`\nСтрок данных: ${testCase.preconditions.length + testCase.steps.length + 1}`);
}

main().catch(err => {
  console.error('Ошибка:', err.message);
  process.exit(1);
});
