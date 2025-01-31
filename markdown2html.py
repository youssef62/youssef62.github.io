import markdown
from markdown.extensions.extra import ExtraExtension
from argparse import ArgumentParser
import os
import re

def markdown_to_html_with_css(input_file, output_file, css_file):
    """
    Convert a Markdown file to an HTML file with LaTeX support and linked CSS styling.
    """
    # Read the input Markdown file
    with open(input_file, 'r', encoding='utf-8') as f:
        markdown_content = f.read()
    
    # Convert Markdown to HTML
    html_body = markdown.markdown(markdown_content, extensions=[ExtraExtension()])
    
    # Extract the first H1 title
    match = re.search(r'<h1>(.*?)</h1>', html_body, re.IGNORECASE)
    title = match.group(1) if match else "Markdown with LaTeX"

    # Wrap the body in an HTML template and link the external CSS file
    html_template = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>{title}</title>
    <link rel="stylesheet" href="{css_file}">
    <script type="text/javascript" async>
      MathJax = {{
        tex: {{
          inlineMath: [['$', '$']],  /* Support for inline LaTeX */
          displayMath: [['$$', '$$']]  /* Support for block LaTeX */
        }},
        options: {{
          renderActions: {{
            addMenu: [0]  /* Disable MathJax menu */
          }}
        }}
      }};
    </script>
    <script type="text/javascript" async
      src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js">
    </script>
</head>
<body>
{html_body}
</body>
</html>
"""
    
    # Write the HTML output to a file
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(html_template)

def convert_all_markdown_files_to_html(input_folder, output_folder, css_file):
    """
    Convert all Markdown files in a folder to HTML files with LaTeX support and linked CSS styling.
    """
    # Ensure output folder exists
    os.makedirs(output_folder, exist_ok=True)
    
    # Get a list of all Markdown files in the input folder
    markdown_files = [f for f in os.listdir(input_folder) if f.endswith('.md')]
    
    # Convert each Markdown file to an HTML file
    for markdown_file in markdown_files:
        input_file = os.path.join(input_folder, markdown_file)
        output_file = os.path.join(output_folder, markdown_file.replace('.md', '.html'))
        print(f"Converting {input_file} to {output_file}")
        markdown_to_html_with_css(input_file, output_file, css_file)

if __name__ == "__main__":
    # Parse command-line arguments
    input_folder = "md"
    output_folder = "html"
    css_file = "styles.css"
    # Convert all Markdown files in the input folder
    convert_all_markdown_files_to_html(input_folder, output_folder, css_file)
    print("Conversion complete.")

