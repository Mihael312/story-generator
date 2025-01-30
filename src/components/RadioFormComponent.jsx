import React, { useState } from "react";
import { Document, Packer, Paragraph, TextRun } from "docx";
import Markdown from 'react-markdown';

const RadioFormComponent = () => {
  const [scriptTitle, setScriptTitle] = useState("");
  const [additionalData, setAdditionalData] = useState("");
  const [excludedWords, setExcludedWords] = useState("");
  const [desiredWordCount, setDesiredWordCount] = useState("");

  // Store the parsed JSON data in state
  const [sectionsData, setSectionsData] = useState([]);        // Will contain all "sections"
  const [majorSectionsData, setMajorSectionsData] = useState([]); // Will contain the "major_sections"

  // Keep track of content for each section (keyed by the section's id)
  const [sectionContents, setSectionContents] = useState({});

  const [loading, setLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState("o1-preview");
  const [selectedView, setSelectedView] = useState("3rd");

  // For demo: This is your key. Ideally, put your key in .env and reference it with import.meta.env.VITE_OPENAI_KEY
  const openAIKey = ""
  const anthropicKey = ""

  // Sleep function
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /**
   * Universal function to call either Anthropic or OpenAI.
   * If `forcedModel` is supplied, that overrides whatever is in `selectedModel`.
   */
  const callAPI = async (messages, maxTokens, forcedModel = null) => {
    // figure out which model to use
    const modelToUse = forcedModel || selectedModel;  // override if forcedModel provided

    const isAnthropic = modelToUse.includes("claude");
    const endpoint = isAnthropic
      ? "https://api.anthropic.com/v1/messages"
      : "https://api.openai.com/v1/chat/completions";

    const headers = isAnthropic
      ? {
          "x-api-key": anthropicKey,
          "Content-type": "application/json",
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        }
      : {
          Authorization: `Bearer ${openAIKey}`,
          "Content-type": "application/json",
        };

    let modelName = modelToUse;
    // Custom model override if Claude is selected
    if (modelToUse.includes("claude")) {
      modelName = "claude-3-5-sonnet-20241022";
    }

    // Build request body
    let body;
    if (isAnthropic) {
      // Anthropic format
      body = {
        model: modelName,
        messages,
        max_tokens: maxTokens,
        temperature: 0.2,
      };
    } else {
      // OpenAI format
      body = {
        model: modelName,
        messages,
      };
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    return response.json();
  };

  /**
   * Generate the script by:
   * 1) Getting the JSON structure of sections + major_sections (ALWAYS with o1-mini).
   * 2) Parsing + storing them in state.
   * 3) Generating text for each smaller section (using the selected model).
   */
  const handleGenerateScript = async () => {
    if (!scriptTitle || !desiredWordCount) {
      alert("Please enter a title and specify the word count.");
      return;
    }

    setLoading(true);
    // Reset data in state
    setSectionsData([]);
    setMajorSectionsData([]);
    setSectionContents({});

    try {
      // Decide how many sections to request from the first call
      let sectionsCount;
      let neededWords = 1000;
      if (desiredWordCount < 10000) {
        neededWords = Math.max(100, Math.floor((desiredWordCount - 1000) / 1000) * 100);
      }

      // Original formula for o1-preview
      if (selectedModel === "o1-preview") {
        sectionsCount = desiredWordCount > 1200 ? Math.ceil(desiredWordCount / 1200) : 1;
      } else {
        // New formula for claude 3.5 sonnet and gpt-4o
        sectionsCount = desiredWordCount > 770 ? Math.ceil(desiredWordCount / 770) : 1;
      }

      // Minimum of 10
      if (sectionsCount < 10) {
        sectionsCount = 10;
      }

      // 1) FIRST CALL: Generate the JSON structure using "o1-mini" ONLY
      const initialMessages = [
        {
          role: "user",
          content: `You are a storyteller/narator and you have to generate ONLY A JSON OBJECT that contains array of ${sectionsCount} (IF NUMBER IS LESS THEN 10 CHANGE IT TO 10) objects
          that should have the following structure:
          {
            "id": "Section ID",
            "title": "Section title",
            "format": "A concise description or example of how the section should be structured",
            "data": "Relevant data to be discussed in this section ("" if none)"
          } 
          And one more array that should have a structure:
          {
            "major_sections": "An array that MUST HAVE 10 OBJECTS where each object represents a major section of the script. Each object should have:"
              {
              "title": The major section title.
              "grouped_ids": An array of IDs from the sections array representing the sections that belong to this major section (NUMBER OF ID).
              }
          }

          The script title is ${scriptTitle}

          *Ensure each section follows a logical, chronological order.* 

***TONE AND FORMAT:*** 
Inspirational, story telling

***ADDITIONAL INFO/DATA:*** 
${additionalData}

***Make sure you only return valid JSON (no code blocks).***`
        },
      ];

      const initialMessages2 = [
        {
          role: "user",
          content: `You are a storyteller/narator and you have to generate ONLY A JSON OBJECT that contains array of ${sectionsCount/2} (IF NUMBER IS LESS THEN 10 CHANGE IT TO 10) objects
          that should have the following structure:
          {
            "id": "Section ID",
            "title": "Section title",
            "format": "A concise description or example of how the section should be structured",
            "data": "Relevant data to be discussed in this section ("" if none)"
            "summary": "A brief summary of the section"
          } 
          And one more array that should have a structure:
          {
            "major_sections": "An array that MUST HAVE 10 OBJECTS where each object represents a major section of the script. Each object should have:"
              {
              "title": The major section title.
              "grouped_ids": An array of IDs from the sections array representing the sections that belong to this major section (NUMBER OF ID).
              }
          }

          The script title is ${scriptTitle}

          *Ensure each section follows a logical, chronological order.* 

          ***TONE AND FORMAT:*** 
          Inspirational, story telling

          ***ADDITIONAL INFO/DATA:*** 
          ${additionalData}

          THIS IS THE SECOND PART OF THE SCRIPT (2nd REQUEST); PLEASE CONTINUE FROM WHERE YOU LEFT OFF. Here is summary of previous sections and titles of last 5 sections:
          ${sections_summary}
          ${titles.slice(-5).map(title => title.title)}`
        }
      ];

      // forcedModel = "o1-mini"
      const initialResponse = await callAPI(initialMessages, 2000, "o1-preview");

      // 2) Parse the returned JSON fully
      let responseSections
      let titles;
      let major_sections;
      
      try {
        if (selectedModel.includes("claude") & !forcedModel) {
          // For Anthropics, the top-level might differ, but let's attempt straightforward parse
          console.log(selectedModel)
          console.log(initialResponse)
          parsedObj = JSON.parse(
            initialResponse.content[0].text
              .replace(/```json/g, "")
              .replace(/```/g, "")
              .trim()
          ).sections.map(section => section.title); // Extract titles
          major_sections = JSON.parse(
            initialResponse.content[0].text
              .replace(/```json/g, "")
              .replace(/```/g, "")
              .trim()
          ).major_sections.map(section => section); // Extract major sections
        } else {
          // For OpenAI
          console.log(selectedModel)
          console.log(initialResponse)
          parsedObj = JSON.parse(
            initialResponse.choices[0].message.content
              .replace(/```json/g, "")
              .replace(/```/g, "")
              .trim()
          ).sections.map(section => section.title); // Extract titles
          major_sections = JSON.parse(
            initialResponse.choices[0].message.content
              .replace(/```json/g, "")
              .replace(/```/g, "")
              .trim()
          ).major_sections.map(section => section); // Extract major sections
        }
        titles = responseSections.map((title, index) => ({ id: index, title }));
      } catch (error) {
        console.error("Error parsing JSON:", error);
        alert("Error parsing JSON response from the API.");
        setLoading(false);
        return;
      }
      console.log("Major Sections:", major_sections);
      console.log("Response Sections:", titles);

      const batchSize = 5;
      let batchIndex = 0;

      // Temporary dictionary to store content keyed by the ID
      let tempSectionContents = {};

      while (batchIndex * batchSize < sections.length) {
        const batch = sections.slice(
          batchIndex * batchSize,
          batchIndex * batchSize + batchSize
        );

        const batchPromises = batch.map(async (sec, idx) => {
          // Identify the previous and next section for continuity
          const currentIndex = batchIndex * batchSize + idx;
          const prevSectionTitle =
            currentIndex > 0 ? sections[currentIndex - 1].title : "There is no Previous section";
          const nextSectionTitle =
            currentIndex < sections.length - 1
              ? sections[currentIndex + 1].title
              : "There is no Next section";

          const contentMessages = [
            {
              role: "user",
              content: `
You are a storyteller/narrator. Write a detailed story/script (~${neededWords} words) for the following section:

- Write in ${
                selectedView === "3rd"
                  ? "3rd person"
                  : "1st person"
              }.
- Do not include scene directions or narrator markers, only the spoken text.
- No welcoming phrases at the beginning.
- Keep language simple, avoid mystical or overly complex terms.
- Ensure coherence and flow from the previous section to this one.
- If possible, exclude these words: ${excludedWords}

Title: ${sec.title}
Domain: ${scriptTitle}

Current Section: ${sec.title}
Previous Section: ${prevSectionTitle}
Next Section: ${nextSectionTitle}`
            }
          ];

          try {
            // For content generation, we use the user's selected model (no forced override).
            const contentResponse = await callAPI(contentMessages, 2000);

            const content = selectedModel.includes("claude")
              ? contentResponse.content[0].text
              : contentResponse.choices[0].message.content;

            // Store in the dictionary keyed by the ID
            tempSectionContents[sec.id] = content;
          } catch (error) {
            console.error(`Error fetching content for section ID: ${sec.id}`, error);
            tempSectionContents[sec.id] = "Error fetching content";
          }
        });

        await Promise.all(batchPromises);

        // Update global state as we go
        setSectionContents({ ...tempSectionContents });

        batchIndex++;

        // If there are more sections to process, wait to avoid rate limits
        if (batchIndex * batchSize < sections.length) {
          await sleep(60000);
        }
      }

      // Final update of the state with all sections
      setSectionContents({ ...tempSectionContents });

    } catch (error) {
      console.error("Error during script generation:", error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Build 10 final sections from majorSectionsData by concatenating 
   * the relevant smaller sections (based on grouped_ids).
   */
  const buildFinalSections = () => {
    return majorSectionsData.map((majorSec) => {
      const combinedContent = majorSec.grouped_ids
        .map((secId) => sectionContents[secId] || "")
        .join("\n\n");

      return {
        title: majorSec.title,
        content: combinedContent,
      };
    });
  };

  /**
   * Download the final 10 major sections as a Word doc
   */
  const handleDownloadDoc = () => {
    // Build the major-sections-based grouping
    const finalSections = buildFinalSections();

    // Create docx
    const doc = new Document({
      sections: [
        {
          properties: {},
          children: finalSections
            .map((section) => {
              // Split combined content by lines
              const paragraphs = section.content.split("\n").map((line) => {
                let formattedLine = line
                  .replace(/<b>(.*?)<\/b>/g, "**$1**")
                  .replace(/<i>(.*?)<\/i>/g, "_$1_");
                return new Paragraph({
                  children: [new TextRun(formattedLine)],
                });
              });
              return [
                new Paragraph({
                  children: [new TextRun({ text: section.title, bold: true })],
                }),
                ...paragraphs,
                new Paragraph({ children: [] }), // blank line
              ];
            })
            .flat(),
        },
      ],
    });

    // Convert to Blob and download
    Packer.toBlob(doc).then((blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      let filename =
        scriptTitle
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "_")
          .replace(/_+/g, "_")
          .replace(/^_|_$/g, "") || "generated_content";

      link.href = url;
      link.download = `${filename}.docx`;
      link.click();
      window.URL.revokeObjectURL(url);
    });
  };

  const handleSetSelectedView = (view) => {
    setSelectedView(view);
  };

  const getWordCount = (text) => {
    return text.split(/\s+/).filter(word => word.length > 0).length;
  };

  // Build the final 10 sections (each a concatenation of one or more original sections)
  const finalMajorSections = buildFinalSections();

  return (
    <>
      <div className="max-w-md mx-auto mt-10 p-6 bg-white rounded-lg shadow-md">
        {/* Select AI Model */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select AI Model:
          </label>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 text-gray-700"
          >
            <option value="o1-preview">o1-preview</option>
            <option value="claude 3.5 sonnet">claude 3.5 sonnet</option>
            <option value="gpt-4o">gpt-4o</option>
          </select>
        </div>

        {/* Script Title */}
        <div className="mb-6">
          <label
            htmlFor="scriptTitle"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Enter the title of the script:
          </label>
          <input
            type="text"
            id="scriptTitle"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 text-gray-700"
            value={scriptTitle}
            onChange={(e) => setScriptTitle(e.target.value)}
            placeholder="Enter the script title"
          />
        </div>

        {/* Additional Data */}
        <div className="mb-6">
          <label
            htmlFor="additionalData"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Enter additional data (summary, narrative, etc.):
          </label>
          <textarea
            id="additionalData"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 text-gray-700"
            style={{ height: "200px", resize: "vertical", whiteSpace: "pre-wrap" }}
            value={additionalData}
            onChange={(e) => setAdditionalData(e.target.value)}
            placeholder="Enter additional data"
          />
        </div>

        {/* Excluded Words */}
        <div className="mb-6">
          <label
            htmlFor="excludedWords"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Words to exclude (not guaranteed):
          </label>
          <input
            type="text"
            id="excludedWords"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 text-gray-700"
            value={excludedWords}
            onChange={(e) => setExcludedWords(e.target.value)}
            placeholder="Enter forbidden words"
          />
        </div>

        {/* Desired Word Count */}
        <div className="mb-6">
          <label
            htmlFor="desiredWordCount"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Desired Word Count:
          </label>
          <input
            type="number"
            id="desiredWordCount"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 text-gray-700"
            value={desiredWordCount}
            onChange={(e) => setDesiredWordCount(e.target.value)}
            placeholder="1000"
            min={1000}
            max={100000}
            step={1000}
          />
        </div>

        {/* View Format Radio Buttons */}
        <div className="mb-6">
          <div className="flex justify-center mt-3">
            <label htmlFor="3rd">
              <input
                id="3rd"
                className="mx-3"
                type="radio"
                name="viewFormat"
                value="3rd"
                checked={selectedView === "3rd"}
                onChange={(e) => handleSetSelectedView(e.target.value)}
              />
              3rd Person View/Format
            </label>
          </div>
          <div className="flex justify-center mt-3">
            <label htmlFor="1st">
              <input
                id="1st"
                className="mx-3"
                type="radio"
                name="viewFormat"
                value="1st"
                checked={selectedView === "1st"}
                onChange={(e) => handleSetSelectedView(e.target.value)}
              />
              1st Person View/Format
            </label>
          </div>
        </div>

        {/* Generate Button */}
        <button
          onClick={handleGenerateScript}
          className="w-full px-4 py-2 text-white bg-blue-600 rounded-lg shadow-md hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
        >
          Generate
        </button>
      </div>

      {/* Loading Indicator */}
      {loading && (
        <div className="flex justify-center mt-6 flex-col items-center">
          <p className="mb-4 text-gray-700">This may take a few moments...</p>
          <div
            className="spinner-border animate-spin inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full"
            role="status"
          >
            <span className="sr-only">Loading...</span>
          </div>
        </div>
      )}

      {/* Download Button (only shows after majorSectionsData is ready) */}
      {!loading && majorSectionsData.length > 0 && (
        <div className="mt-6">
          <button
            onClick={handleDownloadDoc}
            className="w-25 px-4 py-2 text-white ms-5 bg-green-600 rounded-lg shadow-md hover:bg-green-700 focus:ring-2 focus:ring-green-500 focus:ring-opacity-50"
          >
            Download Word Document
          </button>
        </div>
      )}

      {/* Display the 10 Major Sections (finalMajorSections) */}
      <div className="mt-6 mx-3">
        <h3 className="text-lg ms-2 font-semibold text-gray-800">
          Generated Detailed Responses (10 Major Sections):
        </h3>
        <div className="space-y-4 mt-4 mx-5 p-5">
          {finalMajorSections.map((section, index) => (
            <div key={index} className="p-4 bg-gray-100 rounded-lg shadow-md relative mb-8">
              <h4 className="text-xl font-bold mb-3">{section.title}</h4>
              <div className="flex justify-end items-start">
                <div className="text-sm mb-3 text-gray-500">
                  {getWordCount(section.content)} words
                </div>
              </div>
              <Markdown>{section.content}</Markdown>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

export default RadioFormComponent;
