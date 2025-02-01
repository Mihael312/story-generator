export const initialMessages = (scriptTitle, additionalData, sectionsCount) => {
    return [
      {
        role: "user",
        content: `You are a storyteller/narator and you have to generate ONLY A JSON OBJECT that contains array of ${
          sectionsCount > 50 ? sectionsCount / 2 : sectionsCount
        } (IF NUMBER IS LESS THAN 10 CHANGE IT TO 10) objects
        that should have the following structure:
        {
          "id": "Section ID",
          "title": "Section title",
          "format": "A concise description or example of how the section should be structured",
          "data": "Relevant data to be discussed in this section ("" if none)",
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
        Inspirational, storytelling
  
        ***ADDITIONAL INFO/DATA:*** 
        ${additionalData}`
      }
    ];
  };
  
  export const initialMessages2 = (scriptTitle, additionalData, sectionsCount, sections_summary, titles) => {
    return [
      {
        role: "user",
        content: `You are a storyteller/narator and you have to generate ONLY A JSON OBJECT that contains array of ${
          sectionsCount / 2
        } (IF NUMBER IS LESS THAN 10 CHANGE IT TO 10) objects
        that should have the following structure:
        {
          "id": "Section ID",
          "title": "Section title",
          "format": "A concise description or example of how the section should be structured",
          "data": "Relevant data to be discussed in this section ("" if none)",
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
        Inspirational, storytelling
  
        ***ADDITIONAL INFO/DATA:*** 
        ${additionalData}
  
        THIS IS THE SECOND PART OF THE SCRIPT (2nd REQUEST); PLEASE CONTINUE FROM WHERE YOU LEFT OFF. Here is summary of previous sections and titles of last 5 sections:
        ${sections_summary}
        ${titles.slice(-5).map(title => title.title)}`
      }
    ];
  };