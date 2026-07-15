for file in md/*.md; do
    # Get the base name of the file (without the directory and extension)
    base_name=$(basename "$file" .md)
    # Convert the file to HTML
    pandoc "$file" -o "${base_name}.html" --mathjax --standalone --css=styles.css --include-in-header=favicon.html
done