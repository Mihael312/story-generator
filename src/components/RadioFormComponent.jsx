import React, { useState } from "react";
import { Document, Packer, Paragraph, TextRun } from "docx";
import Markdown from 'react-markdown';

const RadioFormComponent = () => {
  const [scriptTitle, setScriptTitle] = useState("");
  const [additionalData, setAdditionalData] = useState("");
  const [excludedWords, setExcludedWords] = useState("");
  const [desiredWordCount, setDesiredWordCount] = useState("");
  const [generatedSections, setGeneratedSections] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState("o1-preview");
  const [selectedView, setSelectedView] = useState("3rd");
  
  const openAIKey = import.meta.env.VITE_OPENAI_KEY;
  const anthropicKey = import.meta.env.VITE_ANTHROPIC_KEY;

  // Sleep function
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const callAPI = async (messages, maxTokens) => {
    const isAnthropic = selectedModel.includes("claude");

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

    let modelName = selectedModel;
    if (selectedModel.includes("claude")) {
      modelName = "claude-3-5-sonnet-20241022";
    }

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

  const handleGenerateScript = async () => {
    if (!scriptTitle || !desiredWordCount) {
      alert("Please enter a title and specify the word count.");
      return;
    }

    setLoading(true);
    setGeneratedSections([]);

    try {
      let sectionsCount;

      let neededWords = 1000
      if (desiredWordCount < 10000){
        neededWords = Math.max(100, Math.floor((desiredWordCount - 1000) / 1000) * 100);
      }
        
      // Original formula for o1-preview
      if (selectedModel === "o1-preview") {
        sectionsCount = desiredWordCount > 1200 ? Math.ceil(desiredWordCount / 1200) : 1;
      } else {
        // New formula for claude 3.5 sonnet and gpt-4o
        sectionsCount = desiredWordCount > 770 ? Math.ceil(desiredWordCount / 770) : 1;
      }

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
          ${additionalData}`
        }
      ];

      // Fetch the section titles
      const initialResponse = await callAPI(initialMessages, 2000);

      let titles;
      let major_sections;

      try {
        if (selectedModel.includes("claude")) {
          titles = JSON.parse(
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
          titles = JSON.parse(
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
      } catch (error) {
        console.error("Error parsing JSON:", error);
        alert("Error parsing JSON response from the API.");
        return;
      }
      console.log("Major Sections:", major_sections);
      console.log("Section Titles:", titles);

      const batchSize = 5;
      let batchIndex = 0;


      while (batchIndex * batchSize < titles.length) {
        const batch = titles.slice(batchIndex * batchSize, batchIndex * batchSize + batchSize);

        const batchPromises = batch.map(async (titleObj, index) => {
          const currentIndex = batchIndex * batchSize + index;
          const prevSection = currentIndex > 0 ? titles[currentIndex - 1].title : "There is no Previous section";
          const nextSection = currentIndex < titles.length - 1 ? titles[currentIndex + 1].title : "There is no Next section";

          const contentMessages = [
            {
              role: "user",
              content: `
              You are a storyteller/narator and must write a detailed story/script text (~${neededWords} words) for the following section. 
              - Write in ${selectedView === "3rd" ? "3rd" : "1st"} person view/format.
              - Do not include scene directions or narrator markers, only the spoken text.
              - Keep the language simple, avoiding mystical or overly complex words.
              - Don't use the welcoming phrases at the beginning of the sections
              - Ensure coherence and flow from the previous section to this one.
              - If possible, exclude these words: ${excludedWords}

              Title: ${titleObj.title}
              Domain: ${scriptTitle}

              Current Section: ${titleObj.title}
              Previous Section: ${prevSection}
              Next Section: ${nextSection}`
            }
          ];

          try {
            const contentResponse = await callAPI(contentMessages, 2000);
            const content = selectedModel.includes("claude")
              ? contentResponse.content[0].text
              : contentResponse.choices[0].message.content;

            return { title: titleObj, content };
          } catch (error) {
            console.error(`Error fetching content for title: ${titleObj.title}`, error);
            return { title: titleObj, content: "Error fetching content" };
          }
        });

        const results = await Promise.all(batchPromises);
        setGeneratedSections((prev) => [...prev, ...results]);

        batchIndex++;

        // If there are more sections to generate, wait for a minute (to avoid rate limits)
        if (batchIndex * batchSize < titles.length) {
          await sleep(60000);
        }
      }

    } catch (error) {
      console.error("Error during script generation:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadDoc = () => {
    const doc = new Document({
      sections: [
        {
          properties: {},
          children: generatedSections
            .map((section) => {
              const paragraphs = section.content.split("\n").map((line) => {
                let formattedLine = line;

                // Replace <b> and <i> tags
                formattedLine = formattedLine.replace(/<b>(.*?)<\/b>/g, "**$1**");
                formattedLine = formattedLine.replace(/<i>(.*?)<\/i>/g, "_$1_");

                const textRun = new TextRun(formattedLine);
                return new Paragraph({
                  children: [textRun],
                });
              });
              return paragraphs;
            })
            .flat(),
        },
      ],
    });

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

  return (
    <>
      <div className="max-w-md mx-auto mt-10 p-6 bg-white rounded-lg shadow-md">
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

        <button
          onClick={handleGenerateScript}
          className="w-full px-4 py-2 text-white bg-blue-600 rounded-lg shadow-md hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
        >
          Generate
        </button>
      </div>

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

      {!loading && generatedSections.length > 0 && (
        <div className="mt-6">
          <button
            onClick={handleDownloadDoc}
            className="w-25 px-4 py-2 text-white ms-5 bg-green-600 rounded-lg shadow-md hover:bg-green-700 focus:ring-2 focus:ring-green-500 focus:ring-opacity-50"
          >
            Download Word Document
          </button>
        </div>
      )}

      <div className="mt-6 mx-3">
        <h3 className="text-lg ms-2 font-semibold text-gray-800">Generated Detailed Responses:</h3>
        <div className="space-y-4 mt-4 mx-5 p-5">

           {/* if sections count is more then major_sections, combine sections based on major_sections[].grouped_ids and display them like that*/}
          {generatedSections.map((section, index) => (
            <div key={index} className="p-4 bg-gray-100 rounded-lg shadow-md relative">
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