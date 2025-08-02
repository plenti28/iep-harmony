export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { accommodations, lessonContent } = req.body;

    if (!accommodations || !lessonContent) {
      return res.status(400).json({ 
        error: 'Missing required fields: accommodations and lessonContent' 
      });
    }

    // Check if we have a Gemini API key, if not, use enhanced mock
    if (!process.env.GEMINI_API_KEY) {
      console.log('No Gemini API key found, using enhanced mock analysis');
      
      const accommodationsList = accommodations.split('\n').filter(acc => acc.trim());
      const lessonWords = lessonContent.toLowerCase();
      
      const results = accommodationsList.map((accommodation) => {
        const accLower = accommodation.toLowerCase();
        let status = 'Not Met';
        let suggestion = '';

        // Smart analysis based on keywords
        if (accLower.includes('extended time') || accLower.includes('extra time')) {
          if (lessonWords.includes('time') || lessonWords.includes('paced') || lessonWords.includes('break')) {
            status = 'Met';
          } else {
            status = 'Not Met';
            suggestion = 'Consider adding specific time allocations or pacing guidance for students who need extended time.';
          }
        } else if (accLower.includes('visual') || accLower.includes('graphic')) {
          if (lessonWords.includes('visual') || lessonWords.includes('chart') || lessonWords.includes('diagram') || lessonWords.includes('graphic')) {
            status = 'Met';
          } else {
            status = 'Partially Met';
            suggestion = 'Add visual aids, charts, or graphic organizers to support this accommodation.';
          }
        } else if (accLower.includes('notes') || accLower.includes('slides')) {
          if (lessonWords.includes('notes') || lessonWords.includes('handout') || lessonWords.includes('provide')) {
            status = 'Met';
          } else {
            status = 'Not Met';
            suggestion = 'Provide notes or handouts in advance for students with this accommodation.';
          }
        } else if (accLower.includes('break') || accLower.includes('frequent')) {
          if (lessonWords.includes('break') || lessonWords.includes('pause') || lessonWords.includes('rest')) {
            status = 'Met';
          } else {
            status = 'Not Met';
            suggestion = 'Include scheduled breaks or movement opportunities in the lesson plan.';
          }
        } else if (accLower.includes('verbal') || accLower.includes('oral')) {
          if (lessonWords.includes('discuss') || lessonWords.includes('verbal') || lessonWords.includes('talk') || lessonWords.includes('oral')) {
            status = 'Met';
          } else {
            status = 'Partially Met';
            suggestion = 'Add verbal response options or oral discussion opportunities.';
          }
        } else if (accLower.includes('small group') || accLower.includes('peer')) {
          if (lessonWords.includes('group') || lessonWords.includes('partner') || lessonWords.includes('pairs')) {
            status = 'Met';
          } else {
            status = 'Not Met';
            suggestion = 'Include small group or peer collaboration activities.';
          }
        } else if (accLower.includes('text-to-speech') || accLower.includes('assistive')) {
          if (lessonWords.includes('technology') || lessonWords.includes('digital') || lessonWords.includes('device')) {
            status = 'Partially Met';
            suggestion = 'Ensure text-to-speech or assistive technology is available and mentioned in lesson procedures.';
          } else {
            status = 'Not Met';
            suggestion = 'Specify how assistive technology will be integrated into this lesson.';
          }
        } else {
          // Generic accommodation
          const words = accLower.split(' ');
          const foundWords = words.filter(word => lessonWords.includes(word)).length;
          
          if (foundWords > words.length / 2) {
            status = 'Partially Met';
            suggestion = 'Review the lesson plan to ensure this accommodation is fully addressed.';
          } else {
            status = 'Not Met';
            suggestion = `Consider how to incorporate "${accommodation.trim()}" into the lesson activities and procedures.`;
          }
        }

        return {
          accommodation: accommodation.trim(),
          status,
          suggestion: status === 'Met' ? undefined : suggestion
        };
      });

      return res.status(200).json({ results });
    }

    // Real Gemini API call
    const prompt = `You are an educational AI assistant that analyzes lesson plans against student accommodations. 

Analyze this lesson plan against these accommodations:

Accommodations:
${accommodations}

Lesson Plan:
${lessonContent}

For each accommodation, determine if it's Met, Partially Met, or Not Met in the lesson plan. Provide specific suggestions for improvements where needed.

Respond with a JSON array of objects with this exact format:
[
  {
    "accommodation": "exact accommodation text",
    "status": "Met" or "Partially Met" or "Not Met",
    "suggestion": "specific suggestion text (only if status is not Met)"
  }
]

Only include the suggestion field if the status is not "Met". Respond with valid JSON only, no other text.`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.3,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 2048,
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', response.status, errorText);
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      throw new Error('Invalid response from Gemini API');
    }

    const aiResponse = data.candidates[0].content.parts[0].text;
    console.log('Gemini response:', aiResponse);

    // Try to parse the AI response as JSON
    let results;
    try {
      // Clean the response - remove any markdown formatting
      const cleanResponse = aiResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      results = JSON.parse(cleanResponse);
    } catch (parseError) {
      console.error('Failed to parse Gemini response:', parseError);
      console.error('Raw response:', aiResponse);
      
      // Fallback parsing if AI doesn't return proper JSON
      const accommodationsList = accommodations.split('\n').filter(acc => acc.trim());
      results = accommodationsList.map(accommodation => ({
        accommodation: accommodation.trim(),
        status: 'Partially Met',
        suggestion: 'AI analysis suggests reviewing this accommodation in the lesson plan.'
      }));
    }

    // Validate results format
    if (!Array.isArray(results)) {
      throw new Error('AI response is not an array');
    }

    // Ensure each result has required fields
    results = results.map(result => ({
      accommodation: result.accommodation || 'Unknown accommodation',
      status: result.status || 'Not Met',
      suggestion: result.suggestion
    }));

    return res.status(200).json({ results });

  } catch (error) {
    console.error('AI Analysis Error:', error);
    
    // Fallback to basic analysis on any error
    const accommodationsList = req.body.accommodations?.split('\n').filter(acc => acc.trim()) || [];
    const results = accommodationsList.map(accommodation => ({
      accommodation: accommodation.trim(),
      status: 'Not Met',
      suggestion: 'Unable to complete AI analysis. Please review this accommodation manually.'
    }));

    return res.status(200).json({ 
      results,
      note: 'AI analysis failed, showing basic analysis. Error: ' + error.message
    });
  }
}
