import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000';

function ChatBot() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Restore from URL on mount
  useEffect(() => {
    const urlQuery = searchParams.get('q');
    const urlResponse = searchParams.get('r');

    if (urlQuery) {
      setQuery(decodeURIComponent(urlQuery));
    }
    if (urlResponse) {
      setResponse(decodeURIComponent(urlResponse));
    }
  }, []);

  // Custom styles for markdown content
  const markdownStyles = `
    .markdown-content h2 {
      font-size: 1.5rem;
      font-weight: 700;
      margin-top: 1.5rem;
      margin-bottom: 1.5rem;
      color: #f97316;
    }
    .markdown-content h3 {
      font-size: 1.25rem;
      font-weight: 600;
      margin-top: 1.5rem;
      margin-bottom: 0.75rem;
    }
    .markdown-content p {
      margin-bottom: 1rem;
      line-height: 1.6;
    }
    .markdown-content em {
      color: #94a3b8;
      font-style: italic;
    }
    .markdown-content strong {
      font-weight: 600;
      color: #f97316;
      margin-top: 1.5rem;
      margin-bottom: 0.75rem;
      display: block;
      font-size: 1.1rem;
    }
    .markdown-content ul, .markdown-content ol {
      margin: 1rem 0;
      padding-left: 1.5rem;
    }
    .markdown-content li {
      margin-bottom: 0.5rem;
    }

    /* Table container for horizontal scroll on mobile */
    .markdown-content table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      margin: 1.5rem 0;
      background-color: #0f172a;
      border-radius: 0.75rem;
      overflow: hidden;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
      font-size: 0.875rem;
    }

    /* Make tables scrollable on small screens */
    @media (max-width: 768px) {
      .markdown-content table {
        display: block;
        overflow-x: auto;
        white-space: nowrap;
        font-size: 0.75rem;
      }
    }

    .markdown-content th {
      background-color: #1e293b;
      padding: 1rem 0.75rem;
      text-align: left;
      font-weight: 600;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #f97316;
      border-bottom: 2px solid #334155;
      white-space: nowrap;
    }

    @media (min-width: 768px) {
      .markdown-content th {
        padding: 1rem 1rem;
        font-size: 0.8125rem;
      }
    }

    .markdown-content td {
      padding: 1rem 0.75rem;
      border-bottom: 1px solid #1e293b;
      font-size: 0.875rem;
      white-space: nowrap;
    }

    @media (min-width: 768px) {
      .markdown-content td {
        padding: 1rem 1rem;
        font-size: 0.9375rem;
      }
    }

    .markdown-content tbody tr:last-child td {
      border-bottom: none;
    }

    .markdown-content tbody tr:hover {
      background-color: #1e293b;
      transition: background-color 0.15s ease;
    }

    .markdown-content thead tr:hover {
      background-color: #1e293b;
    }

    /* Link styling in tables */
    .markdown-content table a {
      color: #60a5fa;
      text-decoration: none;
      font-weight: 500;
      transition: color 0.15s ease;
    }

    .markdown-content table a:hover {
      color: #93c5fd;
      text-decoration: underline;
    }

    /* Number highlighting */
    .markdown-content td:nth-child(n+4) {
      font-variant-numeric: tabular-nums;
      text-align: center;
    }

    /* First few columns left-aligned */
    .markdown-content td:nth-child(1),
    .markdown-content td:nth-child(2),
    .markdown-content td:nth-child(3) {
      text-align: left;
    }

    /* Player headshot styling */
    .markdown-content .player-header {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1rem;
    }

    .markdown-content .player-header img {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      border: 3px solid #f97316;
      object-fit: cover;
    }

    /* Team logo styling in tables */
    .markdown-content table img {
      width: 24px;
      height: 24px;
      object-fit: contain;
      vertical-align: middle;
      display: inline-block;
    }

    @media (max-width: 768px) {
      .markdown-content table img {
        width: 20px;
        height: 20px;
      }
    }

    /* Image-only links (no underline) */
    .markdown-content a:has(img) {
      text-decoration: none !important;
    }

    .markdown-content a:has(img):hover {
      text-decoration: none !important;
      opacity: 0.8;
    }
  `;

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isLoading) return;

    setIsLoading(true);
    setResponse('');

    try {
      const result = await axios.post(`${API_URL}/api/chat`, {
        query: query.trim()
      });

      const answer = result.data.answer;
      setResponse(answer);

      // Update URL with query and response
      setSearchParams({
        q: encodeURIComponent(query.trim()),
        r: encodeURIComponent(answer)
      });
    } catch (error) {
      console.error('Chat error:', error);
      setResponse('Sorry, I encountered an error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const exampleQuestions = [
    "Who leads the league in points per game?",
    "What are LeBron James' stats this season?",
    "Which team has the best record?",
    "Who won the game between Lakers and Warriors?",
    "Show me the top 5 scorers this month"
  ];

  const handleExampleClick = (question: string) => {
    setQuery(question);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <style>{markdownStyles}</style>
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">
          Ask About NBA Stats
        </h1>
        <p className="text-slate-400">
          Get instant answers about players, teams, games, and statistics
        </p>
      </div>

      {/* Search Bar */}
      <form onSubmit={handleSearch} className="mb-8">
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask anything about NBA stats..."
            disabled={isLoading}
            className="w-full bg-slate-800 border-2 border-slate-700 focus:border-orange-500 text-white rounded-xl px-6 py-4 text-lg focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          />
          <button
            type="submit"
            disabled={!query.trim() || isLoading}
            className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg transition-colors font-semibold"
          >
            {isLoading ? (
              <span className="flex items-center space-x-2">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Searching...</span>
              </span>
            ) : (
              <span>Ask</span>
            )}
          </button>
        </div>
      </form>

      {/* Example Questions */}
      {!response && !isLoading && (
        <div className="mb-8">
          <p className="text-slate-400 text-sm mb-3">Try asking:</p>
          <div className="flex flex-wrap gap-2">
            {exampleQuestions.map((question, index) => (
              <button
                key={index}
                onClick={() => handleExampleClick(question)}
                className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 px-4 py-2 rounded-lg text-sm transition-colors"
              >
                {question}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center">
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
          <p className="text-slate-400">Analyzing your question...</p>
        </div>
      )}

      {/* Response */}
      {response && !isLoading && (
        <div className="bg-slate-800 border-2 border-slate-700 rounded-lg p-6">
          <div className="flex items-start space-x-4 mb-4">
            <div className="text-3xl">🤖</div>
            <div>
              <h3 className="text-lg font-semibold text-white mb-1">Answer</h3>
              <p className="text-sm text-slate-400">{query}</p>
            </div>
          </div>
          <div className="bg-slate-900 rounded-lg p-6 border border-slate-700">
            <div className="markdown-content text-white text-base leading-relaxed">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {response}
              </ReactMarkdown>
            </div>
          </div>
          <button
            onClick={() => {
              setQuery('');
              setResponse('');
              navigate('/chat'); // Clear URL params
            }}
            className="mt-4 text-orange-500 hover:text-orange-400 text-sm font-medium transition-colors"
          >
            Ask another question →
          </button>
        </div>
      )}
    </div>
  );
}

export default ChatBot;
